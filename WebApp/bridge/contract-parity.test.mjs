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
  });
});
