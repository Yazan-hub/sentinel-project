// The Node port of SentinelAddin/Engine/IfcDeliveryGate.cs. Same rules, same sentences — the web and Revit
// must read one vocabulary, so the sentence tests read the C# source rather than copying it.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as gate from "./delivery-gate.mjs";
import { checkDelivery, countWithSubtypes, gateNotChecked, SUBTYPES, BUILDING_ELEMENTS } from "./delivery-gate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ifc = readFileSync(resolve(here, "fixtures/minimal.ifc"));
const csharp = readFileSync(resolve(here, "../../SentinelAddin/Engine/IfcDeliveryGate.cs"), "utf8");

const contract = (over = {}) => ({
  contract_key: "test", ifc_schema: "IFC4",
  required_entities: [{ entity: "IFCWALL", min_count: 1 }, { entity: "IFCPROJECT", min_count: 1 }],
  required_psets: ["Pset_WallCommon"], required_properties: ["FireRating"],
  forbidden_entities: [{ entity: "IFCBUILDINGELEMENTPROXY", max_count: 2147483647, max_ratio: 0.25 }],
  require_georeference: true, ...over,
});

describe("checkDelivery", () => {
  it("passes the fixture against a contract it satisfies, with counts, schema and sha", () => {
    const r = checkDelivery(ifc, contract());
    expect(r.passed).toBe(true);
    expect(r.result).toBe("pass");
    expect(r.failures).toEqual([]);
    expect(r.detected_schema).toBe("IFC4");
    expect(r.entity_counts.IFCWALLSTANDARDCASE).toBe(1);
    expect(r.entity_counts.IFCWALL).toBeUndefined();
    expect(r.total_entities).toBeGreaterThan(30);
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.size).toBe(ifc.length);
  });
  it("counts subtypes toward a required supertype (F25)", () => {
    expect(countWithSubtypes({ IFCWALLSTANDARDCASE: 3, IFCWALL: 1 }, "IFCWALL")).toBe(4);
    expect(countWithSubtypes({ IFCSLABSTANDARDCASE: 2 }, "ifcslab")).toBe(2);
    expect(SUBTYPES.IFCWALL).toEqual(["IFCWALLSTANDARDCASE", "IFCWALLELEMENTEDCASE"]);
  });
  it("fails a missing required entity with the C# sentence", () => {
    const r = checkDelivery(ifc, contract({ required_entities: [{ entity: "IFCBEAM", min_count: 2 }] }));
    expect(r.passed).toBe(false);
    expect(r.result).toBe("fail");
    expect(r.failures).toContain("IFCBEAM: 0 found, contract requires ≥ 2.");
  });
  it("fails a schema mismatch, a missing pset and a missing property with the C# sentences", () => {
    const r = checkDelivery(ifc, contract({ ifc_schema: "IFC2X3", required_psets: ["Pset_SlabCommon"], required_properties: ["ThermalTransmittance"] }));
    expect(r.failures).toContain("Schema mismatch: contract requires IFC2X3, file is IFC4.");
    expect(r.failures).toContain("Required property set 'Pset_SlabCommon' not found in the file.");
    expect(r.failures).toContain("Required property 'ThermalTransmittance' not found in the file.");
  });
  it("fails the proxy ratio: 1 of 4 building elements is 25 %, a 10 % ceiling rejects it", () => {
    const r = checkDelivery(ifc, contract({ forbidden_entities: [{ entity: "IFCBUILDINGELEMENTPROXY", max_count: 2147483647, max_ratio: 0.1 }] }));
    expect(r.failures).toContain("IFCBUILDINGELEMENTPROXY: 1/4 building elements (25%) exceeds 10% — semantics are being lost to proxies.");
  });
  it("rounds an exact half-percent ratio half-to-even like C#'s :F0/:P0 (1/8 = 12.5% → 12%, not 13%)", () => {
    const eightBuildingElements = Array.from({ length: 7 }, (_, i) => `#${i + 1}=IFCWALLSTANDARDCASE('W${i}',$,'Wall${i}');`)
      .concat("#8=IFCBUILDINGELEMENTPROXY('P0',$,'Proxy');")
      .join("\n");
    const r = checkDelivery(eightBuildingElements, contract({ forbidden_entities: [{ entity: "IFCBUILDINGELEMENTPROXY", max_count: 2147483647, max_ratio: 0.1 }] }));
    expect(r.failures).toContain("IFCBUILDINGELEMENTPROXY: 1/8 building elements (12%) exceeds 10% — semantics are being lost to proxies.");
  });
  it("formats the max_ratio ceiling the way C#'s :P0 does for 'round' contract thresholds, not naive double multiply-then-round (1/4 = 25% fixture)", () => {
    // These max_ratio values are exact doubles whose true value sits just above or below the .5
    // boundary once scaled by 100 — a naive `Math.round(100 * maxRatio)` gives the wrong side for
    // some of them (verified against a real `double.ToString("P0")` via the dotnet SDK).
    const cases = [
      [0.025, "3%"],
      [0.015, "1%"],
      [0.075, "7%"],
      [0.005, "1%"],
    ];
    for (const [max_ratio, expected] of cases) {
      const r = checkDelivery(ifc, contract({ forbidden_entities: [{ entity: "IFCBUILDINGELEMENTPROXY", max_count: 2147483647, max_ratio }] }));
      expect(r.failures).toContain(`IFCBUILDINGELEMENTPROXY: 1/4 building elements (25%) exceeds ${expected} — semantics are being lost to proxies.`);
    }
  });
  it("fails a hard max_count with the C# sentence", () => {
    const r = checkDelivery(ifc, contract({ forbidden_entities: [{ entity: "IFCBUILDINGELEMENTPROXY", max_count: 0, max_ratio: 1 }] }));
    expect(r.failures).toContain("IFCBUILDINGELEMENTPROXY: 1 exceeds max 0.");
  });
  it("warns, not fails, when georeference is required and absent", () => {
    const noSite = ifc.toString("utf8").replace(/^#11=IFCSITE.*$/m, "#11=IFCSITE('1YvctVUKr0kugbFTf53O9L',$,'Site',$,$,$,$,$,.ELEMENT.,$,$,$,$,$);");
    const r = checkDelivery(noSite, contract());
    expect(r.passed).toBe(true);
    expect(r.warnings).toContain("No georeference detected on IFCSITE (RefLatitude/RefLongitude).");
  });
  it("refuses an empty or zipped file with the C# sentence", () => {
    const r = checkDelivery(Buffer.from("PK\u0003\u0004 not a step file"), contract());
    expect(r.passed).toBe(false);
    expect(r.failures).toContain("No IFC entities parsed — file may be corrupt or IFCZIP (not yet supported).");
  });
  it("uses the same tables and sentences as the C# gate", () => {
    for (const [sup, subs] of Object.entries(SUBTYPES)) for (const sub of subs) expect(csharp).toContain(`"${sub}"`);
    for (const e of BUILDING_ELEMENTS) expect(csharp).toContain(`"${e}"`);
    expect(csharp).toContain("Required property set '{pset}' not found in the file.");
    expect(csharp).toContain("No georeference detected on IFCSITE (RefLatitude/RefLongitude).");
  });
  it("has no default contract: no loader, no file beside the gate (spec 2026-09-25 4b decision 3)", () => {
    expect(gate.loadDefaultContract).toBeUndefined();
    expect(existsSync(resolve(here, "delivery-contract.json"))).toBe(false);
  });
  it("not checked: no contract judges nothing — never a pass; the file's sha, size and schema are still read", () => {
    const r = gateNotChecked(ifc, "none — not installed for p or its office");
    expect(r).toEqual({
      result: "not_checked", passed: null, reason: "none — not installed for p or its office", contract_key: null,
      detected_schema: "IFC4", total_entities: null, entity_counts: {}, failures: [], warnings: [],
      sha256: checkDelivery(ifc, contract()).sha256, size: ifc.length,
    });
    expect(gateNotChecked("not a step file", "none").detected_schema).toBe("");
  });
});
