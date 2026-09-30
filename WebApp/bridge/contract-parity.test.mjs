// The shared contract-parity fixture (spec 2026-09-25 4b decision 7): each case is one IFC and one full contract
// with the verdict both delivery gates must give. This test runs the Node gate (intake); tools/gate-check runs
// the C# gate (Revit) over the same cases.json — the same contract@n gives the same verdict in both places.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { checkDelivery } from "./delivery-gate.mjs";
import { validateArtefact } from "./artefact-store.mjs";

const dir = new URL("./fixtures/contract-parity/", import.meta.url);
const cases = JSON.parse(readFileSync(new URL("cases.json", dir), "utf8"));

describe("contract parity fixture — the Node gate", () => {
  it("pins an IFCMAPCONVERSION-only georeference and a schema mismatch, and no office literal", () => {
    const byName = Object.fromEntries(cases.map((c) => [c.name, c]));
    expect(byName["ifc4-mapconversion-georef-pass"]).toMatchObject({ contract: { require_georeference: true }, expect: { result: "pass", warnings: 0 } });
    expect(byName["schema-mismatch-fail"].expect.result).toBe("fail");
    expect(readFileSync(new URL("ifc4-mapconversion.ifc", dir), "utf8")).not.toMatch(/IFCSITE\(.*\(\s*-?\d+\s*,\s*-?\d+\s*,/);
    expect(JSON.stringify(cases)).not.toMatch(/BDS|AST/);
  });
  it.each(cases.map((c) => [c.name, c]))("%s", (_name, c) => {
    expect(validateArtefact("contract", c.contract)).toBe(true);           // every case is an installable contract
    const r = checkDelivery(readFileSync(new URL(c.ifc, dir)), c.contract);
    expect({ result: r.result, failures: r.failures.length, warnings: r.warnings.length }).toEqual(c.expect);
    // GATE-E2 cases pin the words and the coverage per class; tools/gate-check checks the C# gate the same way.
    if (c.failure_texts) expect(r.failures).toEqual(c.failure_texts);
    if (c.coverage) expect(r.coverage.map((v) => `${v.requirement} ${v.entity} ${v.covered}/${v.total}`)).toEqual(c.coverage);
  });
  it("pins coverage per class (GATE-E2): 1 of 3 walls fails, all 3 pass, a type-held value counts, $ does not, min_coverage, dotted, a pset on 1 of 2 doors", () => {
    const pinned = cases.filter((c) => c.coverage);
    expect(pinned.length).toBeGreaterThanOrEqual(14);
    const texts = pinned.flatMap((c) => c.failure_texts);
    expect(texts).toContain("Required property 'FireRating': 1/3 IFCWALL (33%) — below 100%.");
    expect(texts).toContain("Required property set 'Pset_DoorCommon': 1/2 IFCDOOR (50%) — below 100%.");
    expect(pinned.find((c) => c.name === "coverage-type-held-value-counts-pass").expect.result).toBe("pass");
    expect(pinned.find((c) => c.name === "coverage-min-half-two-of-three-pass").contract.min_coverage).toBe(0.5);
    // Review fixes: a failing share is floored and a half threshold rounds to even (net48 must not say 63%); a
    // Pset_XTypeCommon, a StandardCase subtype, an IFCTYPEPRODUCT, a non-building class, a dotted name and a wrapped record.
    expect(texts).toContain("Required property 'Combustible': 2/3 IFCWALL (66%) — below 67%.");
    expect(texts).toContain("Required property 'FireRating': 1/3 IFCWALL (33%) — below 62%.");
    expect(pinned.filter((c) => c.ifc === "coverage-mixed.ifc" && c.expect.result === "pass").length).toBe(5);
  });
});
