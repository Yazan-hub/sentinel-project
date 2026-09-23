# Governed Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bridge route that takes an IFC from any source and runs the whole Governed Publish loop headlessly (naming gate, delivery gate, project-IDS adjudication with a receipt, publish on pass, BCF on rejection), with the project's IDS becoming the first entry of a per-project artefact store.

**Architecture:** Four pure Node modules under `WebApp/bridge/` (`delivery-gate.mjs` ports the C# gate as a STEP line scan; `ifc-extract.mjs` reads elements through web-ifc into the referee's `ElementProperties` shape; `artefact-store.mjs` keeps immutable `kind@n` documents plus a pointer per kind and resolves the IDS project → office → client → none; `intake-logic.mjs` sequences G1–G4 through injected deps) are wired by two routes in `bcf-service.mjs` (`/cde/:key/artefacts…`, `/cde/:key/intake`). `adjudicateProposal` reads the IDS through the resolver, so Revit and changesets inherit the project IDS with no add-in change. Two CLIs (`intake.mjs`, `artefact-import.mjs`) and one web button close the loop for humans.

**Tech Stack:** Node 20 ESM (`.mjs`), `web-ifc@0.0.77` (already a bridge dependency), `@thatopen/fragments` `IfcImporter`, Supabase REST through the existing `sb()` helper, vitest (`WebApp/vitest.config` already includes `bridge/**/*.test.mjs`), TypeScript web panel code in `WebApp/src/setups/`.

## Global Constraints

- Honesty rule: a gate-only pass is `recorded`, never `accepted`; failures of the gate, the naming check and the IDS are separate lists, never blended into one number.
- Office code is data: no `BDS`/`AST` literal in code or in the shipped default contract (`contract_key: "bridge-default"`).
- The bridge stays zero-dependency beyond what `WebApp/package.json` already lists; `web-ifc` and `@thatopen/fragments` are already there. Do not add packages.
- `SENTINEL_IDS` is removed, not kept as an override (spec §3). `ids_source` is one of `project | office | client | none`.
- Resolution order for the IDS: project artefact → office artefact → `body.ids` → none. Office resolution is a no-op until the office entity exists (the resolver takes an optional `parentKey` and returns `null` for it today).
- Every judging step writes its own audit row; `audit_log.entity_id` is a uuid or `null`, never a string key.
- Failure sentences of the ported gate are byte-identical to the C# ones in `SentinelAddin/Engine/IfcDeliveryGate.cs` (a test reads both).
- Work on branch `feature/governed-intake` from `master`; every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Run tests from `WebApp/`: `npx vitest run bridge/<file>.test.mjs`. The whole suite (`npm test`, 705+ tests) must stay green before the final merge.
- Windows shell: paths with spaces need quotes; the repo root is `C:\Users\yazan\Claude\Projects\Co BIM Assistant\sentinel-project`.

## File structure

| File | Responsibility |
|---|---|
| `WebApp/bridge/fixtures/minimal.ifc` | Hand-written IFC4: project, site with lat/long, building, storey, one wall (standard case) with an instance pset and a typed pset, one slab, one door, one proxy, one quantity set. The only fixture every test uses. |
| `WebApp/bridge/delivery-gate.mjs` | `checkDelivery(bytes, contract)`; `loadDefaultContract()`; the C# subtype and building-element tables. No web-ifc. |
| `WebApp/bridge/delivery-contract.json` | The neutral default contract. |
| `WebApp/bridge/ifc-extract.mjs` | `extractElements(bytes, opts)` over web-ifc → `{ elements, schema, counts }`. |
| `WebApp/bridge/artefact-store.mjs` | `putArtefact`, `getArtefact`, `listArtefacts`, `resolveIdsSpec`, validators; deps-injected like `changesets-store.mjs`. |
| `WebApp/bridge/intake-logic.mjs` | `runIntake(deps, input)`: the G1–G4 sequence with every side effect behind `deps`. |
| `WebApp/bridge/platform-publish.mjs` | `uploadIfcAsFrag(bytes, name, versionTag)` extracted from the `/ifc` route so intake and `/ifc` share it. |
| `WebApp/bridge/bcf-service.mjs` | Routes: `/cde/:key/artefacts…`, `/cde/:key/intake`; `/ifc` calls the shared helper. |
| `WebApp/bridge/cde-store.mjs` | `adjudicateProposal` uses `resolveIdsSpec`; `serverIdsSpec` deleted; `recordVersionVerdict` extracted. |
| `WebApp/bridge/intake.mjs`, `WebApp/bridge/artefact-import.mjs` | CLIs. |
| `WebApp/src/setups/docs-panel.ts`, `WebApp/src/setups/visibility-panel.ts` | Install on this project; run the installed IDS. |
| Tests | `delivery-gate.test.mjs`, `ifc-extract.test.mjs`, `artefact-store.test.mjs`, `intake-logic.test.mjs`. |

---

### Task 1: Fixture and the delivery gate port

**Files:**
- Create: `WebApp/bridge/fixtures/minimal.ifc`
- Create: `WebApp/bridge/delivery-gate.mjs`
- Create: `WebApp/bridge/delivery-contract.json`
- Test: `WebApp/bridge/delivery-gate.test.mjs`

**Interfaces:**
- Consumes: nothing from other tasks. Reads `SentinelAddin/Engine/IfcDeliveryGate.cs` in the test only.
- Produces: `checkDelivery(bytes: Uint8Array | Buffer | string, contract: Contract) → { passed: boolean, contract_key: string, detected_schema: string, total_entities: number, entity_counts: Record<string, number>, failures: string[], warnings: string[], sha256: string, size: number }`; `loadDefaultContract() → Contract`; `countWithSubtypes(counts, entity) → number`; `SUBTYPES`, `BUILDING_ELEMENTS`. Contract = `{ contract_key, ifc_schema, required_entities: [{entity, min_count}], required_psets: string[], required_properties: string[], forbidden_entities: [{entity, max_count, max_ratio}], require_georeference: boolean }`.

- [ ] **Step 1: Create the branch and the fixture**

```bash
cd "C:\Users\yazan\Claude\Projects\Co BIM Assistant\sentinel-project"
git checkout -b feature/governed-intake master
mkdir WebApp\bridge\fixtures
```

Write `WebApp/bridge/fixtures/minimal.ifc` exactly (LF line endings, no BOM):

```
ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('minimal.ifc','2026-09-23T00:00:00',(''),(''),'Sentinel test fixture','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#2,$);
#4=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#5=IFCUNITASSIGNMENT((#4));
#10=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'Minimal',$,$,$,$,(#3),#5);
#11=IFCSITE('1YvctVUKr0kugbFTf53O9L',$,'Site',$,$,$,$,$,.ELEMENT.,(51,30,0,0),(0,7,0,0),0.,$,$);
#12=IFCBUILDING('2YvctVUKr0kugbFTf53O9L',$,'Building',$,$,$,$,$,.ELEMENT.,$,$,$);
#13=IFCBUILDINGSTOREY('3YvctVUKr0kugbFTf53O9L',$,'Level 1',$,$,$,$,$,.ELEMENT.,0.);
#14=IFCRELAGGREGATES('4YvctVUKr0kugbFTf53O9L',$,$,$,#10,(#11));
#15=IFCRELAGGREGATES('5YvctVUKr0kugbFTf53O9L',$,$,$,#11,(#12));
#16=IFCRELAGGREGATES('6YvctVUKr0kugbFTf53O9L',$,$,$,#12,(#13));
#20=IFCWALLSTANDARDCASE('7YvctVUKr0kugbFTf53O9L',$,'Wall-1','A wall','AST_EXT_ARC_CMU_200 mm',$,$,'W1',.STANDARD.);
#21=IFCSLAB('8YvctVUKr0kugbFTf53O9L',$,'Slab-1',$,$,$,$,'S1',.FLOOR.);
#22=IFCDOOR('9YvctVUKr0kugbFTf53O9L',$,'Door-1',$,$,$,$,'D1',2100.,900.,.DOOR.,.SINGLE_SWING_LEFT.,$);
#23=IFCBUILDINGELEMENTPROXY('AYvctVUKr0kugbFTf53O9L',$,'Trim-1',$,$,$,$,'P1',$);
#24=IFCRELCONTAINEDINSPATIALSTRUCTURE('BYvctVUKr0kugbFTf53O9L',$,$,$,(#20,#21,#22,#23),#13);
#30=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('REI 60'),$);
#31=IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.T.),$);
#32=IFCPROPERTYSET('CYvctVUKr0kugbFTf53O9L',$,'Pset_WallCommon',$,(#30,#31));
#33=IFCRELDEFINESBYPROPERTIES('DYvctVUKr0kugbFTf53O9L',$,$,$,(#20),#32);
#40=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('REI 30'),$);
#41=IFCPROPERTYSINGLEVALUE('LoadBearing',$,IFCBOOLEAN(.F.),$);
#42=IFCPROPERTYSET('EYvctVUKr0kugbFTf53O9L',$,'Pset_WallCommon',$,(#40,#41));
#43=IFCWALLTYPE('FYvctVUKr0kugbFTf53O9L',$,'AST_EXT_ARC_CMU_200 mm',$,$,(#42),$,$,$,.STANDARD.);
#44=IFCRELDEFINESBYTYPE('GYvctVUKr0kugbFTf53O9L',$,$,$,(#20),#43);
#50=IFCQUANTITYLENGTH('Length',$,$,3500.,$);
#51=IFCELEMENTQUANTITY('HYvctVUKr0kugbFTf53O9L',$,'Qto_WallBaseQuantities',$,$,(#50));
#52=IFCRELDEFINESBYPROPERTIES('IYvctVUKr0kugbFTf53O9L',$,$,$,(#20),#51);
#60=IFCPROPERTYSINGLEVALUE('Reference',$,IFCLABEL('D-01'),$);
#61=IFCPROPERTYSET('JYvctVUKr0kugbFTf53O9L',$,'Pset_DoorCommon',$,(#60));
#62=IFCRELDEFINESBYPROPERTIES('KYvctVUKr0kugbFTf53O9L',$,$,$,(#22),#61);
ENDSEC;
END-ISO-10303-21;
```

What the fixture encodes (tests rely on these facts): one IFCWALLSTANDARDCASE and zero IFCWALL lines (subtype counting), one proxy among five building elements (20 %), an instance `Pset_WallCommon.FireRating = REI 60` and a typed `REI 30` on the same wall (instance wins), a `Qto_WallBaseQuantities.Length = 3500`, a site with a latitude tuple (georeference detected), `Pset_DoorCommon.Reference = D-01` on the door.

- [ ] **Step 2: Write the failing gate test**

`WebApp/bridge/delivery-gate.test.mjs`:

```js
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
  it("fails the proxy ratio: 1 of 5 building elements is 20 %, a 10 % ceiling rejects it", () => {
    const r = checkDelivery(ifc, contract({ forbidden_entities: [{ entity: "IFCBUILDINGELEMENTPROXY", max_count: 2147483647, max_ratio: 0.1 }] }));
    expect(r.failures).toContain("IFCBUILDINGELEMENTPROXY: 1/5 building elements (20%) exceeds 10% — semantics are being lost to proxies.");
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
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd WebApp && npx vitest run bridge/delivery-gate.test.mjs`
Expected: FAIL — `Failed to resolve import "./delivery-gate.mjs"`.

- [ ] **Step 4: Write the default contract**

`WebApp/bridge/delivery-contract.json`:

```json
{
  "schema_version": 1,
  "contract_key": "bridge-default",
  "ifc_schema": "",
  "required_entities": [
    { "entity": "IFCPROJECT", "min_count": 1 },
    { "entity": "IFCBUILDINGSTOREY", "min_count": 1 }
  ],
  "required_psets": [],
  "required_properties": [],
  "forbidden_entities": [
    { "entity": "IFCBUILDINGELEMENTPROXY", "max_count": 2147483647, "max_ratio": 0.25 }
  ],
  "require_georeference": false
}
```

- [ ] **Step 5: Write the gate**

`WebApp/bridge/delivery-gate.mjs`:

```js
// IFC delivery gate — the Node port of SentinelAddin/Engine/IfcDeliveryGate.cs, so a file that never
// passed through Revit gets the same contract check with the same sentences. A single pass over the
// STEP text (no web-ifc): entity counts, pset and property names, schema, georeference, SHA-256.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** IFC subtypes that satisfy a contract's required entity (Revit writes every basic wall as
 *  IFCWALLSTANDARDCASE — found live, F25). Mirrors IfcDeliveryGate.Subtypes; the test asserts it. */
export const SUBTYPES = {
  IFCWALL: ["IFCWALLSTANDARDCASE", "IFCWALLELEMENTEDCASE"],
  IFCSLAB: ["IFCSLABSTANDARDCASE", "IFCSLABELEMENTEDCASE"],
  IFCBEAM: ["IFCBEAMSTANDARDCASE"],
  IFCCOLUMN: ["IFCCOLUMNSTANDARDCASE"],
  IFCDOOR: ["IFCDOORSTANDARDCASE"],
  IFCWINDOW: ["IFCWINDOWSTANDARDCASE"],
  IFCMEMBER: ["IFCMEMBERSTANDARDCASE"],
  IFCPLATE: ["IFCPLATESTANDARDCASE"],
};

/** Mirrors IfcDeliveryGate.IsBuildingElement. */
export const BUILDING_ELEMENTS = [
  "IFCWALL", "IFCWALLSTANDARDCASE", "IFCSLAB", "IFCDOOR", "IFCWINDOW", "IFCBEAM", "IFCCOLUMN", "IFCROOF",
  "IFCSTAIR", "IFCSTAIRFLIGHT", "IFCRAILING", "IFCCURTAINWALL", "IFCPLATE", "IFCMEMBER", "IFCCOVERING",
  "IFCFOOTING", "IFCBUILDINGELEMENTPROXY",
];
const BUILDING = new Set(BUILDING_ELEMENTS);

const ENTITY_RX = /^#\d+\s*=\s*(IFC[A-Z0-9]+)\s*\(/;
const SCHEMA_RX = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/;
const PSET_STD_RX = /IFCPROPERTYSET\s*\([^,]+,[^,]+,\s*'([^']+)'/;
const PSET_ALT_RX = /IFCPROPERTYSET\s*\(\s*'[^']*'\s*,\s*#?\d*\s*,?\s*'([^']+)'/;
const PROP_RX = /IFCPROPERTYSINGLEVALUE\s*\(\s*'([^']+)'/;
const GEOREF_RX = /\(\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+/;

export function countWithSubtypes(counts, entity) {
  const key = String(entity).toUpperCase();
  let n = counts[key] || 0;
  for (const sub of SUBTYPES[key] || []) n += counts[sub] || 0;
  return n;
}

export function loadDefaultContract() {
  return JSON.parse(readFileSync(resolve(here, "delivery-contract.json"), "utf8"));
}

/** Percentage the way C# `{x:F0}` prints it (round half away from zero, no decimals). */
const pct0 = (x) => String(Math.round(x + Number.EPSILON));

/**
 * Check IFC bytes (or text) against a delivery contract. Never throws on a bad file — an unparsable
 * file fails with the same sentence the C# gate uses.
 */
export function checkDelivery(input, contract) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  const text = buf.toString("utf8");
  const r = {
    passed: false, contract_key: contract?.contract_key || "", detected_schema: "", total_entities: 0,
    entity_counts: {}, failures: [], warnings: [],
    sha256: createHash("sha256").update(buf).digest("hex"), size: buf.length,
  };
  const psets = new Set(), props = new Set();
  let sawGeoref = false;

  for (const line of text.split(/\r?\n/)) {
    if (!r.detected_schema && line.includes("FILE_SCHEMA")) {
      const m = SCHEMA_RX.exec(line);
      if (m) r.detected_schema = m[1].toUpperCase();
    }
    const em = ENTITY_RX.exec(line);
    if (!em) continue;
    const entity = em[1];
    r.total_entities++;
    r.entity_counts[entity] = (r.entity_counts[entity] || 0) + 1;
    if (entity === "IFCPROPERTYSET") {
      const m = PSET_STD_RX.exec(line) || PSET_ALT_RX.exec(line);
      if (m) psets.add(m[1].toLowerCase());
    } else if (entity === "IFCPROPERTYSINGLEVALUE") {
      const m = PROP_RX.exec(line);
      if (m) props.add(m[1].toLowerCase());
    } else if (entity === "IFCSITE") {
      if (GEOREF_RX.test(line)) sawGeoref = true;
    } else if (entity === "IFCMAPCONVERSION") {
      sawGeoref = true;
    }
  }

  const want = String(contract?.ifc_schema || "");
  if (want && r.detected_schema && !r.detected_schema.toUpperCase().startsWith(want.toUpperCase()))
    r.failures.push(`Schema mismatch: contract requires ${want}, file is ${r.detected_schema}.`);

  for (const req of contract?.required_entities || []) {
    const count = countWithSubtypes(r.entity_counts, req.entity);
    if (count < (req.min_count ?? 1)) r.failures.push(`${req.entity}: ${count} found, contract requires ≥ ${req.min_count ?? 1}.`);
  }

  let buildingElements = 0;
  for (const [k, v] of Object.entries(r.entity_counts)) if (BUILDING.has(k)) buildingElements += v;
  for (const lim of contract?.forbidden_entities || []) {
    const count = r.entity_counts[String(lim.entity).toUpperCase()] || 0;
    const maxCount = lim.max_count ?? 0, maxRatio = lim.max_ratio ?? 1;
    if (count > maxCount) r.failures.push(`${lim.entity}: ${count} exceeds max ${maxCount}.`);
    else if (buildingElements > 0 && count / buildingElements > maxRatio)
      r.failures.push(`${lim.entity}: ${count}/${buildingElements} building elements (${pct0(100 * count / buildingElements)}%) exceeds ${pct0(100 * maxRatio)}% — semantics are being lost to proxies.`);
  }

  for (const p of contract?.required_psets || []) if (!psets.has(String(p).toLowerCase())) r.failures.push(`Required property set '${p}' not found in the file.`);
  for (const p of contract?.required_properties || []) if (!props.has(String(p).toLowerCase())) r.failures.push(`Required property '${p}' not found in the file.`);
  if (contract?.require_georeference && !sawGeoref) r.warnings.push("No georeference detected on IFCSITE (RefLatitude/RefLongitude).");
  if (r.total_entities === 0) r.failures.push("No IFC entities parsed — file may be corrupt or IFCZIP (not yet supported).");

  r.passed = r.failures.length === 0;
  return r;
}
```

Note on the ratio sentence: C# prints `{lim.MaxRatio:P0}` as `10%` for 0.10 (invariant culture puts no space before the sign in this code base's certificates — check the string in `tools/gate-check/Check.cs` if in doubt; the test above pins `exceeds 10%`). If `tools/gate-check` shows `10 %` with a space, match that instead and update the test.

- [ ] **Step 6: Run the test**

Run: `cd WebApp && npx vitest run bridge/delivery-gate.test.mjs`
Expected: PASS, 9 tests.

- [ ] **Step 7: Commit**

```bash
git add WebApp/bridge/fixtures/minimal.ifc WebApp/bridge/delivery-gate.mjs WebApp/bridge/delivery-contract.json WebApp/bridge/delivery-gate.test.mjs
git commit -m "feat(bridge): delivery gate ported to Node — same contract, same sentences as the Revit gate, neutral default contract

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Element extraction over web-ifc

**Files:**
- Create: `WebApp/bridge/ifc-extract.mjs`
- Test: `WebApp/bridge/ifc-extract.test.mjs`
- Read for reference: `WebApp/bridge/ifc-to-frag.mjs` (WASM path), `WebApp/src/sentinel-core/adapter/element-properties.ts:9-50` (target shape and `val()`).

**Interfaces:**
- Consumes: the fixture from Task 1.
- Produces: `extractElements(bytes: Uint8Array | Buffer, { classes?: string[] } = {}) → Promise<{ elements: ElementProperties[], schema: string, counts: { elements: number, skipped: number, by_class: Record<string, number> } }>` where `ElementProperties = { modelId: string, localId: number, identity: { GlobalId?, Name?, Class, ObjectType?, PredefinedType?, Tag? }, psets: [{ name, rows: [{ name, value }] }], quantities: [{ name, rows: [{ name, value }] }] }`. Also `DEFAULT_CLASSES`.

- [ ] **Step 1: Write the failing test**

`WebApp/bridge/ifc-extract.test.mjs`:

```js
// The Node extractor must produce exactly what the referee core adjudicates: the ElementProperties
// shape of sentinel-core/adapter/element-properties.ts. The fixture has one wall with an instance pset
// AND a typed pset carrying the same property — the instance value must win (fix e2c9c54 precedence).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { extractElements, DEFAULT_CLASSES } from "./ifc-extract.mjs";
import { adjudicate } from "./sentinel-core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ifc = readFileSync(resolve(here, "fixtures/minimal.ifc"));
const row = (el, pset, name) => el.psets.find((g) => g.name === pset)?.rows.find((r) => r.name === name)?.value;

describe("extractElements", () => {
  it("reads the four building elements with identity, psets and quantities", async () => {
    const { elements, schema, counts } = await extractElements(ifc);
    expect(schema).toBe("IFC4");
    expect(counts.elements).toBe(4);
    expect(counts.skipped).toBe(0);
    const wall = elements.find((e) => e.identity.Class === "IFCWALLSTANDARDCASE");
    expect(wall.identity).toMatchObject({ GlobalId: "7YvctVUKr0kugbFTf53O9L", Name: "Wall-1", ObjectType: "AST_EXT_ARC_CMU_200 mm", Tag: "W1", PredefinedType: "STANDARD" });
    expect(row(wall, "Pset_WallCommon", "FireRating")).toBe("REI 60");      // instance wins over the type's REI 30
    expect(row(wall, "Pset_WallCommon", "IsExternal")).toBe("true");
    expect(row(wall, "Pset_WallCommon", "LoadBearing")).toBe("false");      // only on the type — still present
    expect(wall.quantities.find((g) => g.name === "Qto_WallBaseQuantities").rows).toEqual([{ name: "Length", value: "3500" }]);
    const door = elements.find((e) => e.identity.Class === "IFCDOOR");
    expect(row(door, "Pset_DoorCommon", "Reference")).toBe("D-01");
    expect(elements.every((e) => typeof e.localId === "number" && e.modelId)).toBe(true);
  });
  it("honours a class filter and reports counts by class", async () => {
    const { elements, counts } = await extractElements(ifc, { classes: ["IFCDOOR"] });
    expect(elements.map((e) => e.identity.Class)).toEqual(["IFCDOOR"]);
    expect(counts.by_class).toEqual({ IFCDOOR: 1 });
  });
  it("covers the Revit extractor's classes plus spaces, walls including standard cases", () => {
    for (const c of ["IFCWALL", "IFCSLAB", "IFCDOOR", "IFCWINDOW", "IFCSPACE", "IFCCOLUMN", "IFCBEAM", "IFCFOOTING"]) expect(DEFAULT_CLASSES).toContain(c);
  });
  it("feeds the referee end to end: a FireRating requirement passes on the wall and fails on the slab", async () => {
    const { elements } = await extractElements(ifc);
    const spec = { title: "t", specifications: [
      { name: "WALL — FireRating", applicability: { entity: "IFCWALL" }, requirements: { properties: [{ pset: "Pset_WallCommon", name: "FireRating", cardinality: "required" }] } },
      { name: "SLAB — FireRating", applicability: { entity: "IFCSLAB" }, requirements: { properties: [{ pset: "Pset_SlabCommon", name: "FireRating", cardinality: "required" }] } },
    ] };
    const adj = adjudicate(spec, elements);
    expect(adj.verdict).toBe("rejected");
    expect(adj.failures.some((f) => f.element === "8YvctVUKr0kugbFTf53O9L")).toBe(true);   // the slab
    expect(adj.failures.some((f) => f.element === "7YvctVUKr0kugbFTf53O9L")).toBe(false);  // the wall passes
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd WebApp && npx vitest run bridge/ifc-extract.test.mjs`
Expected: FAIL — cannot resolve `./ifc-extract.mjs`.

- [ ] **Step 3: Write the extractor**

`WebApp/bridge/ifc-extract.mjs`:

```js
// Elements from an IFC, in the referee's ElementProperties shape, read through web-ifc in Node.
// The Revit side reads the same shape out of Revit parameters (GovernedElementExtractor); this is
// the path for a file that never saw Revit. Identity attributes from the entity line, psets through
// IsDefinedBy (instance) and IsTypedBy (type), quantities from IfcElementQuantity. Never throws on
// one bad element: it is counted as skipped.
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as WebIFC from "web-ifc";

const here = dirname(fileURLToPath(import.meta.url));
const WASM_DIR = resolve(here, "../node_modules/web-ifc") + "/";

/** The classes the Revit extractor exports (GovernedElementExtractor.CategoryToIfc) plus spaces,
 *  curtain walls and railings. Subtypes (IFCWALLSTANDARDCASE) are included through web-ifc's
 *  includeInherited flag, so a wall is a wall whichever way the exporter wrote it. */
export const DEFAULT_CLASSES = [
  "IFCWALL", "IFCSLAB", "IFCROOF", "IFCCOVERING", "IFCDOOR", "IFCWINDOW", "IFCSTAIR", "IFCCOLUMN",
  "IFCBEAM", "IFCFOOTING", "IFCSPACE", "IFCCURTAINWALL", "IFCRAILING",
];

// web-ifc wraps every attribute as {type, value}; the browser adapter's val() does the same unwrap.
const val = (o) => {
  if (o == null) return undefined;
  if (typeof o === "object" && !Array.isArray(o) && "value" in o) return o.value == null ? undefined : String(o.value);
  if (typeof o !== "object") return String(o);
  return undefined;
};
const bool = (o) => (o && typeof o === "object" && "value" in o && typeof o.value === "boolean") ? String(o.value) : val(o);

const QTY_KEYS = ["LengthValue", "AreaValue", "VolumeValue", "CountValue", "WeightValue", "TimeValue"];

function groupsOf(defs, target) {
  // defs: IfcPropertySet | IfcElementQuantity lines (recursive: true expands HasProperties/Quantities)
  for (const d of defs || []) {
    const name = val(d?.Name);
    if (!name) continue;
    if (Array.isArray(d.HasProperties)) {
      const rows = [];
      for (const p of d.HasProperties) {
        const n = val(p?.Name); if (!n) continue;
        const v = p?.NominalValue !== undefined ? bool(p.NominalValue) : undefined;
        rows.push({ name: n, value: v ?? "" });
      }
      target.psets.push({ name, rows });
    } else if (Array.isArray(d.Quantities)) {
      const rows = [];
      for (const q of d.Quantities) {
        const n = val(q?.Name); if (!n) continue;
        const key = QTY_KEYS.find((k) => q?.[k] !== undefined);
        rows.push({ name: n, value: key ? (val(q[key]) ?? "") : "" });
      }
      target.quantities.push({ name, rows });
    }
  }
}

/** Instance groups first, then the type's; a row already present by (pset, name) is not overridden. */
function mergeTypeGroups(el, typeDefs) {
  const tmp = { psets: [], quantities: [] };
  groupsOf(typeDefs, tmp);
  for (const g of tmp.psets) {
    let mine = el.psets.find((x) => x.name === g.name);
    if (!mine) { mine = { name: g.name, rows: [] }; el.psets.push(mine); }
    for (const r of g.rows) if (!mine.rows.some((x) => x.name === r.name)) mine.rows.push(r);
  }
}

export async function extractElements(bytes, { classes = DEFAULT_CLASSES, modelId = "intake" } = {}) {
  const api = new WebIFC.IfcAPI();
  api.SetWasmPath(WASM_DIR, true);
  await api.Init();
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const mid = api.OpenModel(u8);
  const out = { elements: [], schema: "", counts: { elements: 0, skipped: 0, by_class: {} } };
  try {
    try { out.schema = String(api.GetModelSchema(mid) || "").toUpperCase(); } catch { out.schema = ""; }
    const seen = new Set();
    for (const cls of classes) {
      const typeCode = WebIFC[cls.toUpperCase()];
      if (typeof typeCode !== "number") continue;
      const ids = api.GetLineIDsWithType(mid, typeCode, true);
      for (let i = 0; i < ids.size(); i++) {
        const id = ids.get(i);
        if (seen.has(id)) continue;
        seen.add(id);
        try {
          const line = api.GetLine(mid, id);
          const concrete = String(api.GetNameFromTypeCode(line.type) || cls).toUpperCase();
          const el = {
            modelId, localId: id,
            identity: {
              GlobalId: val(line.GlobalId), Name: val(line.Name), Class: concrete,
              ObjectType: val(line.ObjectType), PredefinedType: val(line.PredefinedType), Tag: val(line.Tag),
            },
            psets: [], quantities: [],
          };
          groupsOf(await api.properties.getPropertySets(mid, id, true, false), el);
          mergeTypeGroups(el, await api.properties.getTypeProperties(mid, id, true));
          out.elements.push(el);
          out.counts.elements++;
          out.counts.by_class[concrete] = (out.counts.by_class[concrete] || 0) + 1;
        } catch {
          out.counts.skipped++;
        }
      }
    }
  } finally {
    api.CloseModel(mid);
  }
  return out;
}
```

If `GetModelSchema` or `GetNameFromTypeCode` is not exported by `web-ifc-api-node.d.ts` at 0.0.77, check with `grep -n "GetModelSchema\|GetNameFromTypeCode" node_modules/web-ifc/web-ifc-api-node.d.ts`. Fallbacks: schema from the header (`api.GetHeaderLine(mid, WebIFC.FILE_SCHEMA)` → `Schemas[0].value`), class name from a reverse lookup table built once as `Object.entries(WebIFC).filter(([k, v]) => k.startsWith("IFC") && typeof v === "number")`.

`getTypeProperties(mid, id, true)` returns the type's HasPropertySets already expanded; if at this version it returns the type lines themselves (with `HasPropertySets` arrays of references), expand with `api.GetLine(mid, ref.value, true)` before `groupsOf`.

- [ ] **Step 4: Run the test**

Run: `cd WebApp && npx vitest run bridge/ifc-extract.test.mjs`
Expected: PASS, 4 tests. First run initialises the WASM (about a second).

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/ifc-extract.mjs WebApp/bridge/ifc-extract.test.mjs
git commit -m "feat(bridge): element extraction over web-ifc in the referee's ElementProperties shape — instance psets win over type psets, quantities included

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```


---

### Task 3: Artefact store, IDS resolver, and the referee reading through it

**Files:**
- Create: `WebApp/bridge/artefact-store.mjs`
- Test: `WebApp/bridge/artefact-store.test.mjs`
- Modify: `WebApp/bridge/cde-store.mjs:784-806` (delete `serverIdsSpec`), `:848-871` (resolver), `:912-924` (extract `recordVersionVerdict`)
- Modify: `WebApp/bridge/changesets-store.mjs:27-28` (comment only)
- Read for reference: `WebApp/bridge/changesets-store.mjs:1-45` (the `wire(deps)` idiom), `WebApp/bridge/members-store.mjs:118-134` (`myRole`, `requireMinRole`), `WebApp/bridge/cde-store.mjs:960-1000` (`docGet`, `docUpsert`, `docInsert`, `docList`).

**Interfaces:**
- Consumes: `cde-store` exports `ensureProject(key)`, `docGet(store, pid, docId)`, `docInsert(store, pid, docId, data)`, `docUpsert(store, pid, docId, data)`, `audit(project_id, entity_type, entity_id, action, actor, oldv, newv)`; `members-store` `requireMinRole(key, min)`.
- Produces: `KINDS = ["ids","ruleset","naming","contract","guideline","layers","type_catalog"]`; `putArtefact(key, kind, body, { actor, source }, deps?) → Promise<{ kind, version, sha256, installed_by, installed_at, source }>`; `getArtefact(key, kind, deps?) → Promise<null | { kind, version, sha256, installed_by, installed_at, source, body }>`; `getArtefactVersion(key, kind, version, deps?)`; `listArtefacts(key, deps?) → Promise<Record<kind, pointer|null>>`; `resolveIdsSpec(key, body, deps?) → Promise<{ spec: object|null, source: "project"|"office"|"client"|"none", ref: string|null, sha256: string|null, client_ids_ignored: boolean }>`; `cde-store` exports `recordVersionVerdict(key, version_id, result, actor)`; `adjudicateProposal` responses carry `ids_source` (new vocabulary), `ids_ref`, `ids_sha256`.

- [ ] **Step 1: Write the failing store test**

`WebApp/bridge/artefact-store.test.mjs`:

```js
// Per-project standards as immutable, hashed artefacts: kind@n documents plus one pointer per kind.
// Tested against an in-memory doc store so the sequencing (insert → pointer → audit) is exact.
import { describe, it, expect } from "vitest";
import { putArtefact, getArtefact, getArtefactVersion, listArtefacts, resolveIdsSpec, KINDS } from "./artefact-store.mjs";

function memDeps({ role = "lead", parentKey = null } = {}) {
  const docs = new Map(), audits = [];
  const k = (s, p, d) => `${s}|${p}|${d}`;
  return {
    audits, docs,
    ensureProject: async (key) => ({ id: `uuid-${key}`, key }),
    docGet: async (s, p, d) => docs.get(k(s, p, d)) ?? null,
    docInsert: async (s, p, d, data) => { if (docs.has(k(s, p, d))) throw Object.assign(new Error("duplicate"), { status: 409 }); docs.set(k(s, p, d), data); },
    docUpsert: async (s, p, d, data) => { docs.set(k(s, p, d), data); },
    audit: async (pid, et, eid, action, actor, oldv, newv) => { audits.push({ pid, et, eid, action, actor, oldv, newv }); },
    requireMinRole: async (key, min) => { if (role !== "lead" && role !== "owner" && role !== "service") throw Object.assign(new Error(`this action requires the ${min} role`), { status: 403 }); },
    officeKeyOf: async () => parentKey,
  };
}
const spec = { title: "Aster IDS", specifications: [{ name: "DOOR — FireRating", applicability: { entity: "IFCDOOR" }, requirements: { properties: [{ pset: "Pset_DoorCommon", name: "FireRating", cardinality: "required" }] } }] };

describe("artefact store", () => {
  it("installs ids@1 then ids@2, keeps both, points at the latest, audits each install", async () => {
    const d = memDeps();
    const p1 = await putArtefact("aster-tower", "ids", spec, { actor: "lead@example.test", source: { document_id: "doc-1" } }, d);
    expect(p1).toMatchObject({ kind: "ids", version: 1, installed_by: "lead@example.test" });
    expect(p1.sha256).toMatch(/^[0-9a-f]{64}$/);
    const p2 = await putArtefact("aster-tower", "ids", { ...spec, title: "Aster IDS v2" }, { actor: "lead@example.test" }, d);
    expect(p2.version).toBe(2);
    expect(p2.sha256).not.toBe(p1.sha256);
    expect((await getArtefact("aster-tower", "ids", d)).body.title).toBe("Aster IDS v2");
    expect((await getArtefactVersion("aster-tower", "ids", 1, d)).body.title).toBe("Aster IDS");
    expect(d.audits.map((a) => a.action)).toEqual(["artefact_installed ids@1", "artefact_installed ids@2"]);
    expect(d.audits[1].oldv).toMatchObject({ version: 1 });
    expect(d.audits.every((a) => a.eid === null)).toBe(true);   // audit_log.entity_id is a uuid or null
  });
  it("refuses an unknown kind and an IDS without specifications, and a viewer", async () => {
    const d = memDeps();
    await expect(putArtefact("p", "recipes", {}, { actor: "x" }, d)).rejects.toMatchObject({ status: 400 });
    await expect(putArtefact("p", "ids", { title: "no specs" }, { actor: "x" }, d)).rejects.toMatchObject({ status: 400 });
    await expect(putArtefact("p", "ids", spec, { actor: "x" }, memDeps({ role: "viewer" }))).rejects.toMatchObject({ status: 403 });
  });
  it("lists every kind, null when nothing is installed", async () => {
    const d = memDeps();
    await putArtefact("p", "ids", spec, { actor: "x" }, d);
    const l = await listArtefacts("p", d);
    expect(Object.keys(l).sort()).toEqual([...KINDS].sort());
    expect(l.ids.version).toBe(1);
    expect(l.ruleset).toBeNull();
  });
});

describe("resolveIdsSpec", () => {
  it("project artefact wins over a client spec, and says so", async () => {
    const d = memDeps();
    await putArtefact("p", "ids", spec, { actor: "x" }, d);
    const r = await resolveIdsSpec("p", { ids: { title: "client", specifications: [] } }, d);
    expect(r.source).toBe("project");
    expect(r.ref).toBe("ids@1");
    expect(r.spec.title).toBe("Aster IDS");
    expect(r.client_ids_ignored).toBe(true);
  });
  it("falls back to the client spec, then to none — never to a server file", async () => {
    const d = memDeps();
    const c = await resolveIdsSpec("p", { ids: { title: "client", specifications: [] } }, d);
    expect(c).toMatchObject({ source: "client", ref: null, client_ids_ignored: false });
    const n = await resolveIdsSpec("p", {}, d);
    expect(n).toMatchObject({ spec: null, source: "none", ref: null, sha256: null });
  });
  it("uses the office's artefact when the project has none and an office key resolves", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    await putArtefact("aster-office", "ids", spec, { actor: "x" }, d);
    const r = await resolveIdsSpec("aster-tower", {}, d);
    expect(r.source).toBe("office");
    expect(r.ref).toBe("ids@1");
  });
  it("rejects a raw .ids XML string from a client the way the referee did", async () => {
    await expect(resolveIdsSpec("p", { ids: "<ids/>" }, memDeps())).rejects.toMatchObject({ status: 400 });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd WebApp && npx vitest run bridge/artefact-store.test.mjs`
Expected: FAIL — cannot resolve `./artefact-store.mjs`.

- [ ] **Step 3: Write the store**

`WebApp/bridge/artefact-store.mjs`:

```js
// Per-project standards as artefacts. Each install is an immutable `<kind>@<n>` document with a sha;
// a pointer document per kind names the version in force. Resolution for a judge is project → office →
// what the client sent → none, and the answer always says which one judged (never a server-wide file:
// the cohesion review of 2026-09-23 found SENTINEL_IDS silently outranking every project, D3).
//
// Deps are injected (the changesets-store idiom) so the sequencing is unit-tested without Supabase;
// the defaults are loaded lazily to keep cde-store → artefact-store → cde-store from being a cycle.
import { createHash } from "node:crypto";

export const STORE = "artefact";
export const KINDS = ["ids", "ruleset", "naming", "contract", "guideline", "layers", "type_catalog"];

const err = (status, message) => Object.assign(new Error(message), { status });
const sha256 = (o) => createHash("sha256").update(JSON.stringify(o)).digest("hex");

async function wire(deps = {}) {
  const cde = (deps.ensureProject && deps.docGet && deps.docInsert && deps.docUpsert && deps.audit) ? null : await import("./cde-store.mjs");
  const members = deps.requireMinRole ? null : await import("./members-store.mjs");
  return {
    ensureProject: deps.ensureProject || cde.ensureProject,
    docGet: deps.docGet || cde.docGet,
    docInsert: deps.docInsert || cde.docInsert,
    docUpsert: deps.docUpsert || cde.docUpsert,
    audit: deps.audit || cde.audit,
    requireMinRole: deps.requireMinRole || members.requireMinRole,
    // The office entity lands with cohesion phase 2; until then no project has a parent.
    officeKeyOf: deps.officeKeyOf || (async () => null),
  };
}

/** Kind-specific validation. Only `ids` has a real check today; other kinds accept any object. */
export function validateArtefact(kind, body) {
  if (!KINDS.includes(kind)) throw err(400, `unknown artefact kind '${kind}' (expected one of ${KINDS.join(", ")})`);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw err(400, "artefact body must be a JSON object");
  if (kind === "ids") {
    if (!Array.isArray(body.specifications)) throw err(400, "an IDS artefact needs `specifications: [...]` (the JSON spec shape; raw .ids XML is not accepted server-side)");
    if (body.enforce !== undefined && !["reject", "warn", "off"].includes(body.enforce)) throw err(400, "ids.enforce must be reject | warn | off");
  }
  return true;
}

export async function putArtefact(key, kind, body, { actor, source } = {}, deps) {
  validateArtefact(kind, body);
  const d = await wire(deps);
  await d.requireMinRole(key, "lead");
  const proj = await d.ensureProject(key);
  const prev = await d.docGet(STORE, proj.id, kind);
  const version = (prev?.version || 0) + 1;
  const pointer = {
    kind, version, sha256: sha256(body),
    installed_by: actor || "web", installed_at: new Date().toISOString(),
    source: source && typeof source === "object" ? source : null,
  };
  await d.docInsert(STORE, proj.id, `${kind}@${version}`, { ...pointer, body });
  await d.docUpsert(STORE, proj.id, kind, pointer);
  await d.audit(proj.id, "artefact", null, `artefact_installed ${kind}@${version}`, pointer.installed_by, prev, pointer);
  return pointer;
}

export async function getArtefact(key, kind, deps) {
  if (!KINDS.includes(kind)) throw err(404, `unknown artefact kind '${kind}'`);
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const pointer = await d.docGet(STORE, proj.id, kind);
  if (!pointer) return null;
  return d.docGet(STORE, proj.id, `${kind}@${pointer.version}`);
}

export async function getArtefactVersion(key, kind, version, deps) {
  if (!KINDS.includes(kind)) throw err(404, `unknown artefact kind '${kind}'`);
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  return d.docGet(STORE, proj.id, `${kind}@${Number(version)}`);
}

export async function listArtefacts(key, deps) {
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const out = {};
  for (const kind of KINDS) out[kind] = (await d.docGet(STORE, proj.id, kind)) ?? null;
  return out;
}

/**
 * The IDS a judge must use for `key`: project → office → client → none. Returns the spec and its
 * provenance; `client_ids_ignored` is true when a client sent one but an installed artefact outranked it.
 */
export async function resolveIdsSpec(key, body = {}, deps) {
  const d = await wire(deps);
  const clientSent = body.ids !== undefined && body.ids !== null;
  const own = await getArtefact(key, "ids", deps);
  if (own) return { spec: own.body, source: "project", ref: `ids@${own.version}`, sha256: own.sha256, client_ids_ignored: clientSent };
  const officeKey = await d.officeKeyOf(key);
  if (officeKey) {
    const office = await getArtefact(officeKey, "ids", deps);
    if (office) return { spec: office.body, source: "office", ref: `ids@${office.version}`, sha256: office.sha256, client_ids_ignored: clientSent };
  }
  if (clientSent) {
    if (typeof body.ids === "string") throw err(400, "Submit the IDS as a JSON spec {title, specifications:[…]} — raw .ids XML is parsed browser-side only.");
    return { spec: body.ids, source: "client", ref: null, sha256: sha256(body.ids), client_ids_ignored: false };
  }
  return { spec: null, source: "none", ref: null, sha256: null, client_ids_ignored: false };
}
```

- [ ] **Step 4: Run the store test**

Run: `cd WebApp && npx vitest run bridge/artefact-store.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Point the referee at the resolver and delete the server override**

In `WebApp/bridge/cde-store.mjs`:

(a) Delete the whole block from the comment `// Server-side IDS custody (SENTINEL_IDS) — when set and valid…` (line 784) through the closing brace of `function serverIdsSpec()` (line 806), and the `import { readFileSync }` only if nothing else in the file uses it (grep first; `resolveConfigPath` stays because `defaultNamingRuleset` uses it).

(b) Replace lines 850–869 (from `const serverSpec = serverIdsSpec();` through the end of the `else if (b.ids) { … }` block) with:

```js
  const { resolveIdsSpec } = await import("./artefact-store.mjs");
  const resolved = await resolveIdsSpec(key, b);
  const spec = resolved.spec, idsSource = resolved.source, clientIdsIgnored = resolved.client_ids_ignored;
```

(c) In the proposal audit row's `new_value` (around line 913) add `ids_ref: resolved.ref, ids_sha256: resolved.sha256,` after `ids_source: idsSource,`.

(d) Replace the `if (b.version_id) { await sb(…) }` block (lines 926–938) with a call, and add the exported function right after `adjudicateProposal`:

```js
  if (b.version_id) await recordVersionVerdict(key, b.version_id, { verdict, summary, failures, naming, warned, agent, ids_ref: resolved.ref }, trustedActor);
```

```js
/** Stamp a verdict on a specific file version so the Versions panel badges the row
 *  (entity_id = version id, action "verdict:<verdict>"). Separate from the proposal row on purpose. */
export async function recordVersionVerdict(key, version_id, r, actor) {
  const proj = await ensureProject(key);
  await sb(`audit_log`, {
    method: "POST",
    body: {
      project_id: proj.id, entity_type: "file_version", entity_id: version_id,
      action: `verdict:${r.verdict}`, actor: resolveActor(actor, "web"), old_value: null,
      new_value: { ids: r.summary?.ids, summary: r.summary, failures: (r.failures || []).slice(0, 20), naming: r.naming ?? null, warned: !!r.warned, ids_ref: r.ids_ref ?? null, ...(r.agent ? { agent: r.agent } : {}) },
    },
    prefer: "return=minimal", service: true,
  });
}
```

(e) In the return object of `adjudicateProposal` add `ids_ref: resolved.ref, ids_sha256: resolved.sha256,` next to `ids_source`.

(f) Update the doc comment above `adjudicateProposal` (lines 807–812): replace the "Server-side IDS custody…" sentences with: `IDS custody: the project's installed artefact (artefact-store.mjs) → the office's → the client's posted spec → none; the response says which judged in ids_source / ids_ref.`

(g) `WebApp/bridge/changesets-store.mjs:27-28`: change the comment to `// Reuse the referee as-is: it resolves the project's installed IDS (artefact-store) and writes its own`.

- [ ] **Step 6: Run the whole bridge suite**

Run: `cd WebApp && npx vitest run bridge`
Expected: PASS. If a test asserted `ids_source: "server"` or imported `serverIdsSpec`, update it to the new vocabulary (`project | office | client | none`) — grep `bridge/*.test.mjs` for `server-invalid|ids_source|SENTINEL_IDS`.

- [ ] **Step 7: Commit**

```bash
git add WebApp/bridge/artefact-store.mjs WebApp/bridge/artefact-store.test.mjs WebApp/bridge/cde-store.mjs WebApp/bridge/changesets-store.mjs
git commit -m "feat(bridge): per-project artefact store with IDS as the first kind; the referee resolves project → office → client → none and the SENTINEL_IDS server override is gone

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Intake logic (pure, deps-injected)

**Files:**
- Create: `WebApp/bridge/intake-logic.mjs`
- Test: `WebApp/bridge/intake-logic.test.mjs`

**Interfaces:**
- Consumes: shapes only — `checkDelivery` (Task 1), `extractElements` (Task 2), `adjudicateProposal` response `{ verdict, summary, failures, naming, warned, ids_source, ids_ref, audit_id, receipt, agent }`, `registerFileVersion` response `{ container_id, iso_name, version: { id, revision, platform_item_id, is_live } }`.
- Produces: `runIntake(deps, input) → Promise<IntakeResult>` with `deps = { loadContract(key), checkDelivery(bytes, contract), extractElements(bytes), adjudicate(key, body), raiseBcf(key, result, { author }), uploadIfc(bytes, name, revision), registerFileVersion(key, body), recordVersionVerdict(key, versionId, result, actor), audit(key, entity_type, action, actor, value) }` and `input = { key, name, bytes, source, actor?, revision?, note?, agent?, raise_bcf? }`. `IntakeResult = { verdict: "accepted"|"rejected"|"recorded", stage: "gate"|"ids"|"published"|"upload_failed", gate, naming, summary, failures, ids_source, ids_ref, audit_id, receipt, bcf?, version?, published: boolean, error?, sha256, size }`. Also `validateIntakeInput(input)` (throws 400 with a message).

- [ ] **Step 1: Write the failing test**

`WebApp/bridge/intake-logic.test.mjs`:

```js
// The G1–G4 sequence with every side effect stubbed: what runs, what does not, and in which order.
import { describe, it, expect } from "vitest";
import { runIntake, validateIntakeInput } from "./intake-logic.mjs";

const bytes = Buffer.from("ISO-10303-21;");
function stubs({ gatePass = true, verdict = "accepted", uploadFails = false } = {}) {
  const calls = [];
  const rec = (name, ret) => async (...a) => { calls.push([name, ...a]); return typeof ret === "function" ? ret(...a) : ret; };
  return {
    calls,
    loadContract: rec("loadContract", { contract_key: "bridge-default" }),
    checkDelivery: rec("checkDelivery", { passed: gatePass, contract_key: "bridge-default", detected_schema: "IFC4", total_entities: 40, entity_counts: {}, failures: gatePass ? [] : ["IFCPROJECT: 0 found, contract requires ≥ 1."], warnings: [], sha256: "ab".repeat(32), size: 13 }),
    extractElements: rec("extractElements", { elements: [{ identity: { Class: "IFCDOOR", GlobalId: "g1" }, psets: [], quantities: [] }], schema: "IFC4", counts: { elements: 1, skipped: 0, by_class: { IFCDOOR: 1 } } }),
    adjudicate: rec("adjudicate", { verdict, summary: { ids: verdict === "recorded" ? null : "Aster IDS", elements: 1 }, failures: verdict === "rejected" ? [{ element: "g1", requirement: "FireRating" }] : [], naming: { ok: true }, warned: false, ids_source: verdict === "recorded" ? "none" : "project", ids_ref: verdict === "recorded" ? null : "ids@1", audit_id: 901, receipt: { ledger_hash: "h" } }),
    raiseBcf: rec("raiseBcf", { raised: 1 }),
    uploadIfc: uploadFails ? rec("uploadIfc", () => { throw new Error("platform 401"); }) : rec("uploadIfc", { format: "frag", name: "x.frag", itemId: "item-1", bytes: 9 }),
    registerFileVersion: rec("registerFileVersion", { container_id: "c-1", iso_name: "ASTR26-AST-ZZ-XX-M3-A-0001.ifc", version: { id: "v-1", revision: "P01", platform_item_id: "item-1", is_live: true } }),
    recordVersionVerdict: rec("recordVersionVerdict", undefined),
    audit: rec("audit", undefined),
  };
}
const input = { key: "aster-tower", name: "ASTR26-AST-ZZ-XX-M3-A-0001.ifc", bytes, source: "astra", actor: "agent:astra", revision: "P01" };
const names = (d) => d.calls.map((c) => c[0]);

describe("runIntake", () => {
  it("stops at the delivery gate: audit row, no adjudication, no version", async () => {
    const d = stubs({ gatePass: false });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "rejected", stage: "gate", published: false, sha256: "ab".repeat(32) });
    expect(r.gate.failures).toHaveLength(1);
    expect(names(d)).toEqual(["loadContract", "checkDelivery", "audit"]);
    expect(d.calls.find((c) => c[0] === "audit")[2]).toBe("IFC delivery gate FAIL: ASTR26-AST-ZZ-XX-M3-A-0001.ifc");
  });
  it("rejected by the IDS: gate PASS audited, BCF raised, no version", async () => {
    const d = stubs({ verdict: "rejected" });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "rejected", stage: "ids", published: false, ids_source: "project", ids_ref: "ids@1" });
    expect(r.bcf).toEqual({ raised: 1 });
    expect(names(d)).toEqual(["loadContract", "checkDelivery", "audit", "extractElements", "adjudicate", "raiseBcf"]);
    const adjBody = d.calls.find((c) => c[0] === "adjudicate")[2];
    expect(adjBody).toMatchObject({ source: "astra", actor: "agent:astra", container_name: input.name });
    expect(adjBody.elements).toHaveLength(1);
  });
  it("raise_bcf:false skips the BCF step on a rejection", async () => {
    const d = stubs({ verdict: "rejected" });
    const r = await runIntake(d, { ...input, raise_bcf: false });
    expect(r.bcf).toBeUndefined();
    expect(names(d)).not.toContain("raiseBcf");
  });
  it("accepted: upload, register with sha and size, stamp the version verdict", async () => {
    const d = stubs();
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "accepted", stage: "published", published: true });
    expect(r.version).toMatchObject({ container_id: "c-1", version_id: "v-1", revision: "P01", platform_item_id: "item-1", format: "frag" });
    expect(names(d)).toEqual(["loadContract", "checkDelivery", "audit", "extractElements", "adjudicate", "uploadIfc", "registerFileVersion", "recordVersionVerdict"]);
    const reg = d.calls.find((c) => c[0] === "registerFileVersion")[2];
    expect(reg).toMatchObject({ name: input.name, revision: "P01", sha256: "ab".repeat(32), size_bytes: 13, platform_item_id: "item-1", author: "agent:astra" });
    expect(d.calls.find((c) => c[0] === "recordVersionVerdict").slice(1, 3)).toEqual(["aster-tower", "v-1"]);
  });
  it("recorded (no IDS anywhere) publishes on the gate pass alone and says so", async () => {
    const d = stubs({ verdict: "recorded" });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "recorded", stage: "published", published: true, ids_source: "none" });
    expect(r.note).toBe("No project IDS installed — published on the delivery-gate pass alone.");
  });
  it("an upload failure after acceptance keeps the verdict and reports the failure honestly", async () => {
    const d = stubs({ uploadFails: true });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "accepted", stage: "upload_failed", published: false });
    expect(r.error).toMatch(/platform 401/);
    expect(names(d)).not.toContain("registerFileVersion");
  });
});

describe("validateIntakeInput", () => {
  it("requires a project key, an .ifc name, bytes and a source", () => {
    expect(() => validateIntakeInput({ ...input, name: "model.rvt" })).toThrow(/\.ifc/);
    expect(() => validateIntakeInput({ ...input, source: "" })).toThrow(/source/);
    expect(() => validateIntakeInput({ ...input, bytes: Buffer.alloc(0) })).toThrow(/Empty/);
    expect(validateIntakeInput(input)).toMatchObject({ revision: "P01", actor: "agent:astra" });
    expect(validateIntakeInput({ ...input, actor: undefined, revision: undefined })).toMatchObject({ actor: "astra", revision: undefined });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd WebApp && npx vitest run bridge/intake-logic.test.mjs`
Expected: FAIL — cannot resolve `./intake-logic.mjs`.

- [ ] **Step 3: Write the logic**

`WebApp/bridge/intake-logic.mjs`:

```js
// Governed Intake: the Governed Publish loop for an IFC that did not come from Revit.
//   G2 delivery gate → G1+G3 naming + IDS adjudication (one referee call) → G4 publish on pass.
// Pure sequencing; every side effect is a dep so the order is unit-tested. Honesty rules: a gate-only
// pass is "recorded", never "accepted"; the three failure lists stay separate; an upload failure after
// an accepted verdict does not undo the verdict — it is reported as unpublished.
const err = (status, message) => Object.assign(new Error(message), { status });

export function validateIntakeInput(input = {}) {
  const key = String(input.key || "").trim();
  const name = String(input.name || "").trim();
  const source = String(input.source || "").trim();
  if (!key) throw err(400, "project key required");
  if (!/\.ifc$/i.test(name)) throw err(400, "name must be the container's ISO name ending in .ifc");
  if (!input.bytes || !input.bytes.length) throw err(400, "Empty body — POST the .ifc file as the request body.");
  if (!source) throw err(400, "source required (who produced the file: astra, pascal, navisworks, cli, an email)");
  return {
    key, name, source, bytes: input.bytes,
    actor: (input.actor && String(input.actor).trim()) || source,
    revision: input.revision ? String(input.revision).trim() : undefined,
    note: input.note ? String(input.note) : undefined,
    agent: input.agent && typeof input.agent === "object" ? input.agent : undefined,
    raise_bcf: input.raise_bcf !== false,
  };
}

export async function runIntake(deps, rawInput) {
  const input = validateIntakeInput(rawInput);
  const { key, name, bytes, source, actor, revision, note, agent } = input;

  // G2 — delivery gate (the contract the project or the bridge default names).
  const contract = await deps.loadContract(key);
  const gate = await deps.checkDelivery(bytes, contract);
  const gateRow = { file: name, passed: gate.passed, contract: gate.contract_key, schema: gate.detected_schema, entities: gate.total_entities, failures: gate.failures.length, sha256: gate.sha256, source };
  await deps.audit(key, "delivery_gate", `IFC delivery gate ${gate.passed ? "PASS" : "FAIL"}: ${name}`, actor, gateRow);
  const base = { gate, sha256: gate.sha256, size: gate.size, naming: null, summary: null, failures: [], ids_source: null, ids_ref: null, audit_id: null, receipt: null, published: false };
  if (!gate.passed) return { ...base, verdict: "rejected", stage: "gate" };

  // G1 + G3 — the referee: naming gate on the container name, IDS on the extracted elements.
  const extracted = await deps.extractElements(bytes);
  const result = await deps.adjudicate(key, { source, actor, agent, elements: extracted.elements, container_name: name, note });
  const judged = {
    ...base, naming: result.naming ?? null, summary: result.summary ?? null, failures: result.failures || [],
    ids_source: result.ids_source, ids_ref: result.ids_ref ?? null, audit_id: result.audit_id ?? null, receipt: result.receipt ?? null,
    extracted: extracted.counts,
  };
  if (result.verdict === "rejected") {
    const out = { ...judged, verdict: "rejected", stage: "ids" };
    if (input.raise_bcf && (result.failures || []).length > 0) out.bcf = await deps.raiseBcf(key, result, { author: actor });
    return out;
  }

  // G4 — publish on pass: fragments + platform upload, then the CDE version with the verdict badge.
  const verdict = result.verdict; // "accepted" or "recorded"
  const noteLine = verdict === "recorded" ? "No project IDS installed — published on the delivery-gate pass alone." : undefined;
  let upload;
  try { upload = await deps.uploadIfc(bytes, name, revision || "v1"); }
  catch (e) { return { ...judged, verdict, stage: "upload_failed", note: noteLine, error: String(e?.message || e) }; }
  const reg = await deps.registerFileVersion(key, {
    name, revision, sha256: gate.sha256, size_bytes: gate.size, platform_item_id: upload.itemId ?? null,
    author: actor, notes: note ?? null, title: name,
  });
  const versionId = reg?.version?.id ?? null;
  if (versionId) await deps.recordVersionVerdict(key, versionId, result, actor);
  return {
    ...judged, verdict, stage: "published", published: true, note: noteLine,
    version: { container_id: reg?.container_id ?? null, version_id: versionId, revision: reg?.version?.revision ?? revision ?? null, platform_item_id: upload.itemId ?? null, format: upload.format },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `cd WebApp && npx vitest run bridge/intake-logic.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/intake-logic.mjs WebApp/bridge/intake-logic.test.mjs
git commit -m "feat(bridge): intake sequencing — gate, referee, publish-on-pass, BCF on rejection, honest upload failure

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Routes — artefacts and intake, shared platform upload

**Files:**
- Create: `WebApp/bridge/platform-publish.mjs`
- Modify: `WebApp/bridge/bcf-service.mjs:782-830` (`/ifc` calls the helper), the `/cde/` block after the `propose` route (`:968-980`) (new `artefacts` and `intake` routes; add `const p4 = seg[4]`).
- Read for reference: `bcf-service.mjs:216-250` (`send`, `readBody`, `readRaw`), `:293` (`raiseGovernedFailureTopics(cde, pid, result, opts)`), `:48` (`MAX_UPLOAD`).

**Interfaces:**
- Consumes: Tasks 1–4 exports; `cde.audit`, `cde.registerFileVersion`, `cde.adjudicateProposal`, `cde.recordVersionVerdict`, `cde.ensureProject`.
- Produces: `uploadIfcAsFrag(bytes, name, versionTag) → Promise<{ ok: true, format: "frag"|"ifc", name, itemId, bytes, note? }>` (throws `{status: 503}` when the platform is not configured); HTTP routes `GET /cde/:key/artefacts`, `GET /cde/:key/artefacts/:kind`, `GET /cde/:key/artefacts/:kind/:version`, `PUT /cde/:key/artefacts/:kind` (body = artefact JSON; `?actor=` optional), `POST /cde/:key/intake?name=&source=&actor=&revision=&note=&raise_bcf=&agent_model=&agent_tool=&agent_prompt_sha256=` (body = raw IFC bytes).

- [ ] **Step 1: Extract the upload helper**

`WebApp/bridge/platform-publish.mjs`:

```js
// IFC bytes → fragments → That Open Platform item. Shared by the /ifc upload route and Governed Intake
// so a file published by either path lands the same way (viewable .frag first, raw .ifc as fallback).
export async function uploadIfcAsFrag(bytes, name, versionTag = "v1") {
  const { getConfig, createClient, uploadBytes } = await import("./thatopen-client.mjs");
  let cfg;
  try { cfg = getConfig(); }
  catch (e) { throw Object.assign(new Error(String(e?.message || e)), { status: 503 }); }
  const client = createClient(cfg);
  const projectId = cfg.projectId; // the platform project the token can write to — never a Sentinel key
  try {
    const { ifcBytesToFrag } = await import("./ifc-to-frag.mjs");
    const frag = await ifcBytesToFrag(new Uint8Array(bytes));
    const fragName = name.replace(/\.ifc$/i, ".frag");
    const { result, size } = await uploadBytes(client, projectId, frag, fragName, versionTag);
    return { ok: true, format: "frag", name: fragName, itemId: result?.item?._id, bytes: size };
  } catch (convErr) {
    const { result, size } = await uploadBytes(client, projectId, new Uint8Array(bytes), name, versionTag);
    return { ok: true, format: "ifc", name, itemId: result?.item?._id, bytes: size, note: `frag conversion failed (${convErr?.message || convErr}); uploaded raw IFC` };
  }
}
```

In `bcf-service.mjs` replace the body of the `/ifc` route between `const versionTag = …` and the outer `catch (e)` with:

```js
      const { uploadIfcAsFrag } = await import("./platform-publish.mjs");
      return send(res, 200, await uploadIfcAsFrag(bytes, name, versionTag));
```

keeping the outer `catch` (its 401 wording and `e?.status || 500`) — a 503 from the helper now flows through it with the same message as before.

- [ ] **Step 2: Add the routes**

In the `/cde/` block, after `const p1 = seg[1], p2 = seg[2], p3 = seg[3];` add `const p4 = seg[4];`. Directly after the `propose` route (the `if (p2 === "propose" && !p3 && req.method === "POST") { … }` block) insert:

```js
      // Project artefacts (standards in force): the store every judge reads through (cohesion phase 1).
      //   GET /cde/:key/artefacts · GET /cde/:key/artefacts/:kind · GET /cde/:key/artefacts/:kind/:version
      //   PUT /cde/:key/artefacts/:kind  body = the artefact JSON (ids: {title, specifications, enforce?})
      if (p2 === "artefacts") {
        const art = await import("./artefact-store.mjs");
        if (!p3 && req.method === "GET") return send(res, 200, await art.listArtefacts(p1));
        if (p3 && !p4 && req.method === "GET") {
          const a = await art.getArtefact(p1, p3);
          return a ? send(res, 200, a) : send(res, 404, { message: `no ${p3} artefact installed for ${p1} or its office` });
        }
        if (p3 && p4 && req.method === "GET") {
          const a = await art.getArtefactVersion(p1, p3, p4);
          return a ? send(res, 200, a) : send(res, 404, { message: `no ${p3}@${p4} for ${p1}` });
        }
        if (p3 && !p4 && req.method === "PUT") {
          const body = await readBody(req);
          const actor = url.searchParams.get("actor") || body?.installed_by || "web";
          const source = body?.source && typeof body.source === "object" ? body.source : undefined;
          const { source: _s, installed_by: _i, ...artefact } = body || {};
          return send(res, 201, await art.putArtefact(p1, p3, artefact, { actor, source }));
        }
      }
      // Governed Intake: the whole Governed Publish loop for an IFC from any source (no Revit).
      //   POST /cde/:key/intake?name=<ISO name.ifc>&source=<who>[&actor=&revision=&note=&raise_bcf=false
      //        &agent_model=&agent_tool=&agent_prompt_sha256=]   body = raw .ifc bytes
      if (p2 === "intake" && !p3 && req.method === "POST") {
        if (Number(req.headers["content-length"] || 0) > MAX_UPLOAD) return send(res, 413, { message: `File too large (> ${Math.round(MAX_UPLOAD / 1048576)} MB).` });
        const bytes = await readRaw(req);
        const q = (k) => url.searchParams.get(k) || undefined;
        const agent = (q("agent_model") || q("agent_tool") || q("agent_prompt_sha256")) ? { kind: "agent", model: q("agent_model"), tool: q("agent_tool"), prompt_sha256: q("agent_prompt_sha256") } : undefined;
        const { runIntake } = await import("./intake-logic.mjs");
        const { checkDelivery, loadDefaultContract } = await import("./delivery-gate.mjs");
        const { extractElements } = await import("./ifc-extract.mjs");
        const { uploadIfcAsFrag } = await import("./platform-publish.mjs");
        const art = await import("./artefact-store.mjs");
        const deps = {
          loadContract: async (key) => (await art.getArtefact(key, "contract"))?.body || loadDefaultContract(),
          checkDelivery, extractElements,
          adjudicate: (key, body) => cde.adjudicateProposal(key, body),
          raiseBcf: (key, result, opts) => raiseGovernedFailureTopics(cde, key, result, opts),
          uploadIfc: uploadIfcAsFrag,
          registerFileVersion: (key, body) => cde.registerFileVersion(key, body),
          recordVersionVerdict: (key, vid, result, actor) => cde.recordVersionVerdict(key, vid, result, actor),
          audit: async (key, entityType, action, actor, value) => { const proj = await cde.ensureProject(key); await cde.audit(proj.id, entityType, null, action, actor, null, value); },
        };
        const result = await runIntake(deps, { key: p1, name: q("name"), bytes, source: q("source"), actor: q("actor"), revision: q("revision"), note: q("note"), agent, raise_bcf: q("raise_bcf") !== "false" });
        return send(res, 200, result);
      }
```

`raiseGovernedFailureTopics(cde, pid, result, opts)` takes the project key as `pid` exactly as the propose route passes `p1`; keep that.

- [ ] **Step 3: Smoke the routes against the running bridge**

The managed bridge (`bridge` in `.claude/launch.json`) must be restarted to load the new code. Then, with the bridge token from `%AppData%\Sentinel\bcf-config.json` (`serviceToken`):

```bash
cd WebApp
TOKEN=$(python -c "import json,os;print(json.load(open(os.environ['APPDATA']+'/Sentinel/bcf-config.json'))['serviceToken'])")
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4100/cde/aster-tower/artefacts
```
Expected: `{"ids":null,"ruleset":null,...}`.

```bash
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @../demo/aster/aster-ids.json "http://localhost:4100/cde/aster-tower/artefacts/ids?actor=cli"
```
Expected: `201 {"kind":"ids","version":1,"sha256":"…"}`. (`demo/aster/aster-ids.json` is the compiled Aster IDS; if its root is the compile output with `unmatched`/`stats` keys, that is fine — only `specifications` is validated.)

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" --data-binary @bridge/fixtures/minimal.ifc "http://localhost:4100/cde/aster-tower/intake?name=ASTR26-AST-ZZ-XX-M3-A-0002.ifc&source=cli&raise_bcf=false"
```
Expected: JSON with `verdict`, `stage`, `gate.passed: true`, `ids_source: "project"`, `ids_ref: "ids@1"`; the verdict itself depends on the Aster specs (the fixture's door has no FireRating → `rejected`, `stage: "ids"`). Then `GET /cde/aster-tower/audit` shows the two new rows (`IFC delivery gate PASS: …`, `Proposal rejected from cli`).

- [ ] **Step 4: Run the whole suite, then commit**

Run: `cd WebApp && npm test`
Expected: all green (705 + the new tests).

```bash
git add WebApp/bridge/platform-publish.mjs WebApp/bridge/bcf-service.mjs
git commit -m "feat(bridge): /cde/:key/artefacts and /cde/:key/intake routes; /ifc shares the platform upload helper

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```


---

### Task 6: Two CLIs — intake and artefact import

**Files:**
- Create: `WebApp/bridge/intake.mjs`
- Create: `WebApp/bridge/artefact-import.mjs`
- Read for reference: `WebApp/bridge/mcp-server.mjs:18-26` (bridge base URL and token from `loadEnv()`), `WebApp/bridge/upload-ifc.mjs:14-25` (argument parsing style).

**Interfaces:**
- Consumes: the routes of Task 5; `loadEnv` from `./load-env.mjs` (check the export name with `grep -n "^export" bridge/load-env.mjs`).
- Produces: `node bridge/intake.mjs <file.ifc> --project <key> [--name <iso name>] [--source cli] [--actor <who>] [--revision P01] [--note "..."] [--no-bcf]` exit code 0 on accepted/recorded, 2 on rejected, 1 on error; `node bridge/artefact-import.mjs <file.json> --project <key> --kind ids [--actor <who>]`.

- [ ] **Step 1: Write the intake CLI**

`WebApp/bridge/intake.mjs`:

```js
// Governed Intake from the command line: any IFC → gate → project IDS → verdict → version.
// Usage: node bridge/intake.mjs <file.ifc> --project <key> [--name <iso name>] [--source cli]
//        [--actor <who>] [--revision P01] [--note "..."] [--no-bcf]
// Config: BCF_BASE (default http://127.0.0.1:4100) and BCF_TOKEN from config/.env or the environment.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { loadEnv } from "./load-env.mjs";

const env = { ...process.env, ...loadEnv() };
const BASE = (env.BCF_BASE || "http://127.0.0.1:4100").replace(/\/$/, "");
const TOKEN = env.BCF_TOKEN || "";
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const project = flag("project");
if (!file || !project) { console.error("Usage: node bridge/intake.mjs <file.ifc> --project <key> [--name <iso name>] [--source cli] [--actor <who>] [--revision P01] [--note \"...\"] [--no-bcf]"); process.exit(1); }

const q = new URLSearchParams({ name: flag("name", basename(file)), source: flag("source", "cli") });
for (const k of ["actor", "revision", "note"]) { const v = flag(k); if (v) q.set(k, v); }
if (args.includes("--no-bcf")) q.set("raise_bcf", "false");

const bytes = await readFile(file);
const res = await fetch(`${BASE}/cde/${encodeURIComponent(project)}/intake?${q}`, {
  method: "POST", headers: { "Content-Type": "application/octet-stream", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) }, body: bytes,
});
const r = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`HTTP ${res.status}: ${r.message || JSON.stringify(r)}`); process.exit(1); }

const line = (k, v) => console.log(`${k.padEnd(14)} ${v ?? "—"}`);
line("verdict", `${String(r.verdict).toUpperCase()} (${r.stage})`);
line("file", `${q.get("name")} · ${r.size} bytes · sha ${String(r.sha256).slice(0, 16)}…`);
line("gate", `${r.gate?.passed ? "PASS" : "FAIL"} · contract ${r.gate?.contract_key} · ${r.gate?.detected_schema} · ${r.gate?.total_entities} entities`);
for (const f of r.gate?.failures || []) line("  gate ✗", f);
for (const w of r.gate?.warnings || []) line("  gate !", w);
if (r.naming) line("naming", r.naming.ok ? "ok" : `✗ ${(r.naming.errors || r.naming.failures || []).map((e) => e.message || e).join("; ")}`);
line("ids", `${r.ids_source}${r.ids_ref ? " " + r.ids_ref : ""}${r.summary?.ids ? " · " + r.summary.ids : ""}`);
if (r.extracted) line("elements", `${r.extracted.elements} read, ${r.extracted.skipped} skipped`);
line("failures", String((r.failures || []).length));
for (const f of (r.failures || []).slice(0, 10)) line("  ids ✗", `${f.element ?? "?"} — ${f.requirement ?? f.message ?? JSON.stringify(f)}`);
if (r.bcf) line("bcf", `${r.bcf.raised ?? 0} topic(s) raised${r.bcf.error ? " — " + r.bcf.error : ""}`);
line("ledger", r.audit_id != null ? `audit #${r.audit_id} · receipt ${String(r.receipt?.ledger_hash || "").slice(0, 16)}…` : "—");
if (r.version) line("version", `${r.version.revision} · ${r.version.format} · item ${r.version.platform_item_id ?? "—"} · version ${r.version.version_id}`);
if (r.note) line("note", r.note);
if (r.error) line("error", r.error);
process.exit(r.verdict === "rejected" ? 2 : 0);
```

- [ ] **Step 2: Write the import CLI**

`WebApp/bridge/artefact-import.mjs`:

```js
// Install a standards file as a project artefact: node bridge/artefact-import.mjs <file.json> --project <key> --kind ids [--actor <who>]
// The one-time path for the pilot's and Aster's existing ids.json files, so no project starts empty.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { loadEnv } from "./load-env.mjs";

const env = { ...process.env, ...loadEnv() };
const BASE = (env.BCF_BASE || "http://127.0.0.1:4100").replace(/\/$/, "");
const TOKEN = env.BCF_TOKEN || "";
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const project = flag("project"), kind = flag("kind", "ids");
if (!file || !project) { console.error("Usage: node bridge/artefact-import.mjs <file.json> --project <key> --kind ids [--actor <who>]"); process.exit(1); }

const body = JSON.parse(await readFile(file, "utf8"));
body.source = { file: basename(file), imported_at: new Date().toISOString() };
const res = await fetch(`${BASE}/cde/${encodeURIComponent(project)}/artefacts/${encodeURIComponent(kind)}?actor=${encodeURIComponent(flag("actor", "cli"))}`, {
  method: "PUT", headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) }, body: JSON.stringify(body),
});
const r = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`HTTP ${res.status}: ${r.message || JSON.stringify(r)}`); process.exit(1); }
console.log(`Installed ${r.kind}@${r.version} on ${project} · sha ${String(r.sha256).slice(0, 16)}… · by ${r.installed_by}`);
```

- [ ] **Step 3: Run both against the bridge**

```bash
cd WebApp
node bridge/artefact-import.mjs ../demo/aster/aster-ids.json --project aster-tower --kind ids --actor cli
node bridge/intake.mjs bridge/fixtures/minimal.ifc --project aster-tower --name ASTR26-AST-ZZ-XX-M3-A-0002.ifc --source cli --no-bcf
```
Expected: first prints `Installed ids@2 …` (version 2 if Task 5's smoke installed 1); second prints the verdict table with `gate PASS`, `ids project ids@2`, and exits 2 on a rejection (the fixture's door lacks FireRating) or 0.

- [ ] **Step 4: Commit**

```bash
git add WebApp/bridge/intake.mjs WebApp/bridge/artefact-import.mjs
git commit -m "feat(bridge): intake and artefact-import CLIs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Web — Install on this project, and the Visibility panel runs the installed IDS

**Files:**
- Modify: `WebApp/src/setups/docs-panel.ts:1163-1171` (after the `dl` download button inside the Compile to IDS handler)
- Modify: `WebApp/src/setups/visibility-panel.ts:149` (`let idsSpec`) and the `runIds` function that follows it; the status line of the IDS ✓ button
- Read for reference: `docs-panel.ts:160-176` (`base`, `pid()`, `bfetch`, `actor()`, `canGovern()`), `visibility-panel.ts:22, 228-232` (`base`, `bfetch`, `pid()`).

**Interfaces:**
- Consumes: `PUT /cde/:key/artefacts/ids`, `GET /cde/:key/artefacts/ids` (Task 5).
- Produces: nothing programmatic; two UI behaviours.

- [ ] **Step 1: The install button**

In `docs-panel.ts`, directly after `dl.style.marginTop = ".5rem"; box.append(dl);` add:

```ts
        // Close the loop: the compiled spec becomes the PROJECT's IDS (artefact ids@n), which Governed
        // Publish, Governed Intake and the AI-proposal referee all read. Lead/owner only, like the bridge.
        const install = btn("Install on this project", true);
        install.style.marginTop = ".5rem"; install.style.marginLeft = ".5rem";
        install.onclick = async () => {
          install.disabled = true; install.textContent = "Installing…";
          try {
            const who = await actor();
            const res = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/artefacts/ids?actor=${encodeURIComponent(who)}`, {
              method: "PUT", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: r.title, specifications: r.specifications, source: { document_id: doc.id, compiled_at: new Date().toISOString() } }),
            });
            const p = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(p.message || `HTTP ${res.status}`);
            install.textContent = `Installed ids@${p.version}`;
            status(`✓ ids@${p.version} installed on ${pid()} (sha ${String(p.sha256).slice(0, 12)}…) — Governed Publish, intake and AI proposals now judge by it.`);
          } catch (e) {
            install.disabled = false; install.textContent = "Install on this project";
            status(`Install failed: ${esc((e as Error).message)}`);
          }
        };
        if (canGovern()) box.append(install);
```

`doc.id` is the document's id field used elsewhere in the panel (`grep -n "doc.id\b" src/setups/docs-panel.ts` to confirm the name; if the panel calls it `doc.doc_id`, use that).

- [ ] **Step 2: The Visibility panel prefers the installed IDS**

In `visibility-panel.ts`, replace `let idsSpec: IdsSpec = DEMO_IDS;` with:

```ts
  let idsSpec: IdsSpec = DEMO_IDS;
  let idsFrom = "built-in demo IDS";
  /** The project's installed IDS (artefact ids@n) outranks the demo spec; a hand-loaded .ids outranks both. */
  async function loadProjectIds() {
    try {
      const r = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/artefacts/ids`);
      if (r.ok) { const a = await r.json(); if (Array.isArray(a?.body?.specifications)) { idsSpec = a.body as IdsSpec; idsFrom = `project ids@${a.version}`; } }
    } catch { /* bridge offline — the demo spec stays and the status says so */ }
  }
  void loadProjectIds();
```

In `runIds()`, make the first status line name the source: find the `status(` call that announces the run (or the results summary) and prefix it with `Using ${idsFrom} · `. In the `.ids` file handler (line ~285) set `idsFrom = \`file ${f.name}\`` after `idsSpec = parseIds(...)`.

- [ ] **Step 3: Type-check and build**

Run: `cd WebApp && npx tsc --noEmit -p . 2>&1 | grep -v "files-panel:108" | head` (one pre-existing error at `files-panel.ts:108` is known; nothing new may appear), then `npm run build`.
Expected: no new type errors; build succeeds.

- [ ] **Step 4: Verify in the browser** (needs the user signed in on the platform): Documents → the Aster EIR → Compile to IDS → **Install on this project** → status line `✓ ids@N installed on aster-tower`. Then `GET /cde/aster-tower/artefacts/ids` returns it. The Visibility panel cannot be checked while the platform viewer is blocked (F49); note that in the commit.

- [ ] **Step 5: Commit**

```bash
git add WebApp/src/setups/docs-panel.ts WebApp/src/setups/visibility-panel.ts
git commit -m "feat(web): Install on this project after Compile to IDS; Visibility runs the installed project IDS

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Documentation and the removed override

**Files:**
- Modify: `docs/TESTING_PROTOCOL.md` (new Session D2 after Session D), `docs/handbook/05-capability-status.md:12-13` (two rows), `docs/FEATURES_UPDATE_2026-09.md` (1.1 row status), `docs/BDS_GATE_CONFIG.md:71,116-118`, `docs/verdict-contract.md:38`, `config/base-standard/README.md:12,26`, `docs/mcp-server.md` (one note), `SentinelAddin/Engine/IdsSpecFile.cs:8-10` (comment only, no rebuild needed).

- [ ] **Step 1: Protocol drill**

After the Session D table in `docs/TESTING_PROTOCOL.md` add:

```markdown
## Session D2 — Governed Intake (no Revit)

| Step | Pass criteria |
|---|---|
| Install the project IDS | Documents → EIR → Compile to IDS → **Install on this project** → `GET /cde/:key/artefacts/ids` returns `ids@n` with a sha; audit row `artefact_installed ids@n` |
| Fail path FIRST | `node bridge/intake.mjs <foreign.ifc> --project <key> --name <bad name>.ifc --source cli` → `REJECTED (ids)` or a naming failure that names the field; BCF topics per failing requirement on the web Issues panel; **no** new version in Project Files |
| Gate fail | a file breaking the contract (e.g. `--name x.ifc` on an empty IFC) → `REJECTED (gate)` with the C# sentence; audit row `IFC delivery gate FAIL: …`; no adjudication row |
| Pass path | a conforming name and a model that meets the installed IDS → `ACCEPTED (published)`; version in Project Files with the ✓ badge; `POST /receipt/:key/verify` matches; `ids_ref` names the artefact |
| Recorded | with no IDS installed on a fresh project → `RECORDED (published)` and the note "published on the delivery-gate pass alone" |
```

- [ ] **Step 2: Capability rows**

In `docs/handbook/05-capability-status.md` replace the `Element IDS gate` row with:

```markdown
| Element IDS gate (Phase B) | 🟩 Built | The project's installed IDS artefact (`PUT /cde/:key/artefacts/ids`, "Install on this project"); resolution project → office → client → none, named in every verdict as `ids@n`. The `SENTINEL_IDS` server override was removed on 2026-09-23 (cohesion review D3) |
```

and add after the Governed Publish row:

```markdown
| Governed Intake (any IFC → gate → project IDS → verdict → version, no Revit) | 🟩 Built | Route `POST /cde/:key/intake`, CLI `bridge/intake.mjs`; Node delivery gate and web-ifc extractor; moves to ✅ on the Session D2 drill |
```

- [ ] **Step 3: The override, everywhere it is documented**

- `docs/BDS_GATE_CONFIG.md:71` and `:116-118`: replace the `SENTINEL_IDS` instructions with `install the IDS on the project: Documents → Compile to IDS → Install on this project, or node bridge/artefact-import.mjs <ids.json> --project <key> --kind ids`.
- `docs/verdict-contract.md:38`: "**Server-side IDS wins**" becomes "**The project's installed IDS wins.** If the project (or its office) has an `ids` artefact, a client-supplied `ids` is ignored and `client_ids_ignored: true` is recorded; `ids_source` is `project | office | client | none` and `ids_ref` names the version."
- `config/base-standard/README.md:12, 26`: same replacement.
- `docs/FEATURES_UPDATE_2026-09.md`, row 1.1: append ` — **built 2026-09-23** (branch `feature/governed-intake`), drill D2 pending` to the Value cell.
- `docs/mcp-server.md`: one line under the propose tool: "The referee judges by the project's installed IDS artefact; `sentinel_propose` needs no `ids` argument when one is installed."
- `SentinelAddin/Engine/IdsSpecFile.cs:8-10`: change the comment to say the bridge judges by the project's installed artefact and the local file is only what Revit reports in its dialog until cohesion phase 4.

- [ ] **Step 4: Commit**

```bash
git add docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md docs/FEATURES_UPDATE_2026-09.md docs/BDS_GATE_CONFIG.md docs/verdict-contract.md config/base-standard/README.md docs/mcp-server.md SentinelAddin/Engine/IdsSpecFile.cs
git commit -m "docs: Governed Intake drill (Session D2), capability rows, and the removed SENTINEL_IDS override

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Live drill and merge

**Files:**
- Modify: `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` (a short "Governed Intake drill" section) or `docs/TESTING_PROTOCOL.md` ledger, `docs/handbook/05-capability-status.md` (✅ on evidence).

- [ ] **Step 1: Restart the managed bridge**, then install the Aster IDS on `aster-tower` (Task 6 import CLI or the web button).

- [ ] **Step 2: Fail path first**

```bash
cd WebApp
node bridge/intake.mjs "C:\Users\yazan\Desktop\Sentinel Test Folder\BIM_Projekt_Golden_Nugget-Architektur_und_Ingenieurbau.ifc" --project aster-tower --name Golden_Nugget_final.ifc --source cli
```
Expected: naming failure (the name is not the Aster 7-field pattern) → `REJECTED (ids)` with `naming ✗` naming the field, BCF topics if IDS failures exist, no version.

- [ ] **Step 3: Pass path**

```bash
node bridge/intake.mjs "C:\Users\yazan\Desktop\Sentinel Test Folder\BIM_Projekt_Golden_Nugget-Architektur_und_Ingenieurbau.ifc" --project aster-tower --name ASTR26-AST-ZZ-XX-M3-A-0003.ifc --source cli --revision P01
```
Expected: gate PASS; the verdict depends on the model's doors/walls against the Aster IDS — record whichever it is. On `ACCEPTED`: Project Files shows `ASTR26-AST-ZZ-XX-M3-A-0003.ifc` P01 with the ✓ badge; `GET /receipt/aster-tower/<audit_id>` then `POST /receipt/aster-tower/verify` → `matches: true`.

- [ ] **Step 4: Record and merge**

Append the drill results (commands, verdicts, audit ids, receipt result) to the run record; flip the capability row to ✅ only if the pass path published. Then:

```bash
cd WebApp && npm test
git checkout master && git merge --no-ff feature/governed-intake -m "Merge feature/governed-intake — Governed Intake (Features Update 1.1) and the project artefact store (cohesion phase 1)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Self-review notes

- Spec coverage: §1 → Task 2; §2 → Task 1; §3 → Task 3 (+ CLI import Task 6, button Task 7); §4 → Tasks 4–5; §5 → Task 6; §6 honesty → Tasks 4–5 (`recorded`, separate lists, per-step audit); Testing → Tasks 1–4 plus the drill in Task 9; Out of scope untouched.
- Names used across tasks: `checkDelivery`, `loadDefaultContract`, `countWithSubtypes`, `SUBTYPES`, `BUILDING_ELEMENTS` (T1) · `extractElements`, `DEFAULT_CLASSES` (T2) · `putArtefact`, `getArtefact`, `getArtefactVersion`, `listArtefacts`, `resolveIdsSpec`, `KINDS`, `recordVersionVerdict` (T3) · `runIntake`, `validateIntakeInput` (T4) · `uploadIfcAsFrag` (T5).
