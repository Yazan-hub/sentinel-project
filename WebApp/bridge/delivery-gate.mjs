// IFC delivery gate — the Node port of SentinelAddin/Engine/IfcDeliveryGate.cs, so a file that never
// passed through Revit gets the same contract check with the same sentences. A single pass over the
// STEP text (no web-ifc): entity counts, pset and property names, schema, georeference, SHA-256.
// There is no default contract (spec 2026-09-25 4b decision 3): the project or its office installs contract@n,
// and without one the gate is NOT CHECKED (gateNotChecked) — never a pass on a contract nobody installed.
import { createHash } from "node:crypto";

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

/**
 * No contract installed for the project or its office: nothing is judged and nothing passes (result
 * "not_checked", passed null). The file's sha256 and size are still computed — the version registration uses
 * them — and its schema is still reported; entities are not read. `reason` is the none label the caller shows.
 */
export function gateNotChecked(input, reason) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  // ponytail: FILE_SCHEMA is in the STEP HEADER at the top of the file; the first 64 KB always hold it.
  const m = SCHEMA_RX.exec(buf.subarray(0, 1 << 16).toString("utf8"));
  return {
    result: "not_checked", passed: null, reason, contract_key: null, detected_schema: m ? m[1].toUpperCase() : "",
    total_entities: null, entity_counts: {}, failures: [], warnings: [],
    sha256: createHash("sha256").update(buf).digest("hex"), size: buf.length,
  };
}

/**
 * Rounds x*scale to the nearest integer, ties to even, using x's EXACT binary64 value (its real
 * mantissa/exponent bits) rather than `x * scale` computed in double precision first. That naive
 * multiply loses exactly the sub-ULP information a genuine .5 case needs: 0.025's true double value
 * sits fractionally ABOVE 2.5, but `100 * 0.025` rounds to the double nearest 2.5 and erases that,
 * so a naive `pct0(100 * x)` gave "2%" where C# gives "3%". .NET's F0/P0 formatting (since .NET
 * Core 3.0's IEEE-correct formatter) rounds the double's true value, not a re-multiplied one — so
 * we do the scaling exactly too, with BigInt, instead of with float math.
 * Verified against a real `double.ToString("F0"/"P0")` (dotnet SDK) across a 0.0001-step sweep of
 * [0,1] (ratios), a 0-100 sweep of count/buildingElements percentages up to 200/200, and the
 * specific values the review flagged (0.025, 0.015, 0.075, 0.005, 0.0125) — 0 mismatches.
 */
function roundHalfEvenExact(x, scale) {
  const neg = x < 0;
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, Math.abs(x));
  const hi = buf.getUint32(0), lo = buf.getUint32(4);
  const biased = (hi >>> 20) & 0x7ff;
  let mantissa = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let exp2 = biased - 1075;
  if (biased === 0) exp2 = -1074; // subnormal (and zero)
  else mantissa |= 1n << 52n; // implicit leading bit
  const s = BigInt(scale);
  let num = mantissa * s, den = 1n;
  if (exp2 >= 0) num <<= BigInt(exp2);
  else den <<= BigInt(-exp2);
  let q = num / den;
  const rem = num % den, twice = rem * 2n;
  if (twice > den || (twice === den && (q & 1n) === 1n)) q += 1n; // > half, or exact half → even
  const result = Number(q);
  return neg ? -result : result;
}

/** C# `{100.0*count/buildingElements:F0}` — x is already the scaled-by-100 double; just round it. */
const pctF0 = (x) => String(roundHalfEvenExact(x, 1));
/** C# `{lim.MaxRatio:P0}` — ratio is the raw 0..1 double; P0 scales it by 100 as an exact decimal
 *  operation internally, so we do too (never pre-multiply ratio * 100 in float first). */
const pctP0 = (ratio) => String(roundHalfEvenExact(ratio, 100));

/**
 * Check IFC bytes (or text) against an installed delivery contract — validated at install (artefact-store
 * validateArtefact): every field is present, so nothing here fills a default. Never throws on a bad file — an
 * unparsable file fails with the same sentence the C# gate uses. result: "pass" | "fail".
 */
export function checkDelivery(input, contract) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  const text = buf.toString("utf8");
  const r = {
    result: "fail", passed: false, contract_key: contract.contract_key, detected_schema: "", total_entities: 0,
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

  const want = contract.ifc_schema;
  if (want && r.detected_schema && !r.detected_schema.toUpperCase().startsWith(want.toUpperCase()))
    r.failures.push(`Schema mismatch: contract requires ${want}, file is ${r.detected_schema}.`);

  for (const req of contract.required_entities) {
    const count = countWithSubtypes(r.entity_counts, req.entity);
    if (count < req.min_count) r.failures.push(`${req.entity}: ${count} found, contract requires ≥ ${req.min_count}.`);
  }

  let buildingElements = 0;
  for (const [k, v] of Object.entries(r.entity_counts)) if (BUILDING.has(k)) buildingElements += v;
  for (const lim of contract.forbidden_entities) {
    const count = r.entity_counts[String(lim.entity).toUpperCase()] || 0;
    if (count > lim.max_count) r.failures.push(`${lim.entity}: ${count} exceeds max ${lim.max_count}.`);
    else if (buildingElements > 0 && count / buildingElements > lim.max_ratio)
      r.failures.push(`${lim.entity}: ${count}/${buildingElements} building elements (${pctF0(100 * count / buildingElements)}%) exceeds ${pctP0(lim.max_ratio)}% — semantics are being lost to proxies.`);
  }

  for (const p of contract.required_psets) if (!psets.has(String(p).toLowerCase())) r.failures.push(`Required property set '${p}' not found in the file.`);
  for (const p of contract.required_properties) if (!props.has(String(p).toLowerCase())) r.failures.push(`Required property '${p}' not found in the file.`);
  if (contract.require_georeference && !sawGeoref) r.warnings.push("No georeference detected on IFCSITE (RefLatitude/RefLongitude).");
  if (r.total_entities === 0) r.failures.push("No IFC entities parsed — file may be corrupt or IFCZIP (not yet supported).");

  r.passed = r.failures.length === 0;
  r.result = r.passed ? "pass" : "fail";
  return r;
}
