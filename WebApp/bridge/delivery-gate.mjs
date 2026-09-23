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
