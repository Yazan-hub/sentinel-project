// The Node port of SentinelAddin/Engine/IfcDeliveryGate.cs. Same rules, same sentences — the web and Revit
// must read one vocabulary, so the sentence tests read the C# source rather than copying it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { checkDelivery, countWithSubtypes, loadDefaultContract, SUBTYPES, BUILDING_ELEMENTS } from "./delivery-gate.mjs";

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
  it("ships a neutral default contract with no office literal", () => {
    const c = loadDefaultContract();
    expect(c.contract_key).toBe("bridge-default");
    expect(JSON.stringify(c)).not.toMatch(/BDS|AST/);
    expect(checkDelivery(ifc, c).passed).toBe(true);
  });
});
