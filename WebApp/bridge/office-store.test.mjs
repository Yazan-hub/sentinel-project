import { describe, it, expect } from "vitest";
import { validateSnapshot, validateScan } from "./office-store.mjs";

const goodSnapshot = () => ({
  source: { kind: "template", title: "AST_Template.rte", revit_version: "2024" },
  pack: { worksets: [{ name: "ARC_Walls" }], shared_parameters: [{ name: "XXX_Discipline", binding: "instance" }] },
  catalog: { count: 2, types: [
    { category: "Walls", family: "Basic Wall", type: "XXX_EXT_ARC_CMU_200 mm", system: true, width_mm: 200, height_mm: null },
    { category: "Doors", family: "Single-Flush", type: "36\" x 84\"", system: false, width_mm: 914, height_mm: 2134 },
  ] },
  ruleset: { org: "XXX", rules: [{ id: "TN-01", target: "type", tokens: ["ORG", "LOC", "DISC", "MATERIAL", "SIZE"], separator: "_", token_defs: { ORG: "{org}", LOC: "EXT|INT|FND", DISC: "ARC|STR", MATERIAL: "[A-Z0-9][A-Z0-9 \\-]*", SIZE: "\\d+(\\.\\d+)? mm" }, categories: ["Walls"] }] },
  at: "2026-09-17T08:00:00Z",
});

describe("validateSnapshot — names the field, stores nothing partial", () => {
  it("accepts a good snapshot and normalises counts", () => {
    const s = validateSnapshot(goodSnapshot());
    expect(s.catalog.count).toBe(2);
    expect(s.pack.worksets).toHaveLength(1);
    expect(s.ruleset.org).toBe("XXX");
  });
  it("keeps the ruleset's standard_key/semver and the artefact ref/sha256 when the add-in sends them, and only then", () => {
    const s = goodSnapshot();
    Object.assign(s.ruleset, { standard_key: "house-std", semver: "1.4.1", ref: "ruleset@3", sha256: "3f07376abcdef0123456789" });
    expect(validateSnapshot(s).ruleset).toMatchObject({ org: "XXX", standard_key: "house-std", semver: "1.4.1", ref: "ruleset@3", sha256: "3f07376abcdef0123456789" });
    const bare = validateSnapshot(goodSnapshot()).ruleset;
    expect(Object.keys(bare).sort()).toEqual(["org", "rules"]);
    const bad = goodSnapshot(); bad.ruleset.ref = 3;
    expect(() => validateSnapshot(bad)).toThrow(/ruleset\.ref/);
  });
  it("rejects with the offending field", () => {
    for (const [mutate, field] of [
      [(s) => { delete s.source; }, "source"],
      [(s) => { s.source.kind = "sketch"; }, "source.kind"],
      [(s) => { s.pack = "no"; }, "pack"],
      [(s) => { s.pack.worksets = [{}]; }, "pack.worksets[0].name"],
      [(s) => { s.catalog.types = [{ category: "Walls" }]; }, "catalog.types[0].type"],
      [(s) => { s.at = "yesterday"; }, "at"],
    ]) {
      const s = goodSnapshot(); mutate(s);
      expect(() => validateSnapshot(s)).toThrow(expect.objectContaining({ status: 400, message: expect.stringContaining(field) }));
    }
  });
  it("ruleset is optional; catalog capped at 20000 types", () => {
    const s = goodSnapshot(); delete s.ruleset;
    expect(validateSnapshot(s).ruleset).toBeNull();
    const big = goodSnapshot(); big.catalog.types = Array.from({ length: 20001 }, (_, i) => ({ category: "Walls", family: "W", type: "T" + i, system: true }));
    expect(() => validateSnapshot(big)).toThrow(expect.objectContaining({ status: 413 }));
  });
});

describe("validateScan", () => {
  const good = () => ({ doc_title: "Aster Tower.rvt", at: "2026-09-17T08:00:00Z", duration_ms: 1200, elements_checked: 410,
    violations: [{ rule_id: "VN-01", mode: "request", element_id: 1234, element_name: "Level 1 Plan", message: "does not match" }] });
  it("accepts a good report; violations capped at 5000 with the count kept", () => {
    const s = validateScan(good());
    expect(s.violations).toHaveLength(1);
    const big = good(); big.violations = Array.from({ length: 5001 }, (_, i) => ({ rule_id: "WS-01", mode: "warn", element_id: i, element_name: "w", message: "m" }));
    const t = validateScan(big);
    expect(t.violations).toHaveLength(5000);
    expect(t.violations_total).toBe(5001);
  });
  it("rejects a bad mode or missing title, naming the field", () => {
    const b = good(); b.violations[0].mode = "loud";
    expect(() => validateScan(b)).toThrow(expect.objectContaining({ status: 400, message: expect.stringContaining("violations[0].mode") }));
    const c = good(); delete c.doc_title;
    expect(() => validateScan(c)).toThrow(expect.objectContaining({ status: 400, message: expect.stringContaining("doc_title") }));
  });
  it("by_mode totals cover ALL violations, not just the kept 5000", () => {
    const big = good();
    big.violations = Array.from({ length: 4998 }, (_, i) => ({ rule_id: "WS-01", mode: "warn", element_id: i }))
      .concat(Array(3).fill({ rule_id: "WS-01", mode: "block", element_id: 9999 }));
    const t = validateScan(big);
    expect(t.violations).toHaveLength(5000);
    expect(t.violations_total).toBe(5001);
    expect(t.by_mode).toEqual({ monitor: 0, warn: 4998, request: 0, block: 3 });
  });
});
