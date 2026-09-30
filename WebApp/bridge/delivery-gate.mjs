// IFC delivery gate — the Node port of SentinelAddin/Engine/IfcDeliveryGate.cs, so a file that never
// passed through Revit gets the same contract check with the same sentences. A single pass over the
// STEP text (no web-ifc): entity counts, schema, georeference, SHA-256, and which psets and property values each
// element carries — its own and its type's — so required psets and properties are judged per class (GATE-E2).
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
// A required property is judged on building elements and their subtypes (IFC4 IFCSLABSTANDARDCASE…); the proxy ratio
// keeps BUILDING alone, so its wording stays. Mirrors IfcDeliveryGate.IsJudged.
const JUDGED = new Set([...BUILDING_ELEMENTS, ...Object.values(SUBTYPES).flat()]);

const ENTITY_RX = /^#(\d+)\s*=\s*(IFC[A-Z0-9]+)\s*\(/;
const RECORD_START_RX = /^\s*#\d+\s*=/;
const SCHEMA_RX = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/;
const GEOREF_RX = /\(\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+/;
const COMMON_PSET_RX = /^Pset_(.+)Common$/i;
const REF_RX = /#([0-9]+)/g;
const TYPED_VALUE_RX = /^IFC[A-Z0-9_]*\((.*)\)$/s;

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
    entity_counts: {}, failures: [], warnings: [], coverage: [],
    sha256: createHash("sha256").update(buf).digest("hex"), size: buf.length,
  };
  const ix = coverageIndex(contract.required_properties);
  let sawGeoref = false;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (!r.detected_schema && line.includes("FILE_SCHEMA")) {
      const m = SCHEMA_RX.exec(line);
      if (m) r.detected_schema = m[1].toUpperCase();
    }
    const em = ENTITY_RX.exec(line);
    if (!em) continue;
    // A record may wrap over lines (ISO 10303-21): join until its ';' — never past the next record's "#n=".
    while (!recordEnds(line) && i + 1 < lines.length && !RECORD_START_RX.test(lines[i + 1])) line += lines[++i];
    const entity = em[2];
    r.total_entities++;
    r.entity_counts[entity] = (r.entity_counts[entity] || 0) + 1;
    ix.read(Number(em[1]), entity, line, em[0].length);
    if (entity === "IFCSITE") {
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

  // GATE-E2: judged per class, not "present somewhere"; a requirement no class carries is not found.
  const elements = ix.elements(), min = contract.min_coverage ?? 1;
  for (const p of contract.required_psets) if (!judge(r, elements, p, true, min)) r.failures.push(`Required property set '${p}' not found in the file.`);
  for (const p of contract.required_properties) if (!judge(r, elements, p, false, min)) r.failures.push(`Required property '${p}' not found in the file.`);
  if (contract.require_georeference && !sawGeoref) r.warnings.push("No georeference detected on IFCSITE (RefLatitude/RefLongitude).");
  if (r.total_entities === 0) r.failures.push("No IFC entities parsed — file may be corrupt or IFCZIP (not yet supported).");

  r.passed = r.failures.length === 0;
  r.result = r.passed ? "pass" : "fail";
  return r;
}

// ---- GATE-E2: required psets and properties judged per class (mirrors IfcDeliveryGate.cs rule for rule) ----

/**
 * Judge one required pset or property class by class: a coverage entry for each class it applies to and a failure for
 * each class below `min`. A property ("FireRating", or "Pset_DoorCommon.FireRating") applies to each building-element
 * class (or subtype) where at least one element carries it at all — when none does, to every class that carries it;
 * "Pset_XCommon" and "Pset_XTypeCommon" to IFCX and its subtypes (none in the file: where it appears); any other pset to
 * each class where it appears. An element covers it when the pset is on it or on its type (a property: with a value — $
 * or '' is none). false when it applies to no class: the caller says "not found".
 */
function judge(r, elements, req, isPset, min) {
  const want = String(req).toLowerCase();
  if (isPset) return judgeAs(r, elements, req, true, "", want, min);
  // "COBie.Type.Name" is one property whose name has dots: judged whole when the pset.property reading applies nowhere.
  const { pset, prop } = parts(req);
  return judgeAs(r, elements, req, false, pset, prop, min) || (pset !== "" && judgeAs(r, elements, req, false, "", want, min));
}

function judgeAs(r, elements, req, isPset, pset, prop, min) {
  const want = prop;
  // 0 = not carried, 1 = carried with no value, 2 = covered; an element counts its best pset.
  const has = (p) => (isPset ? (p.name === want ? 2 : 0)
    : (pset && p.name !== pset) || !p.props.has(prop) ? 0 : p.props.get(prop) ? 2 : 1);

  const carried = new Map(), covered = new Map();
  for (const { cls, psets } of elements) {
    let best = 0;
    for (const p of psets) best = Math.max(best, has(p));
    if (best > 0) carried.set(cls, (carried.get(cls) || 0) + 1);
    if (best === 2) covered.set(cls, (covered.get(cls) || 0) + 1);
  }

  const common = isPset ? COMMON_PSET_RX.exec(req) : null;
  // Pset_AirTerminalTypeCommon belongs to IFCAIRTERMINAL (held on its type): the occurrence class, never IFCXTYPE.
  const target = common ? `IFC${common[1].toUpperCase().replace(/TYPE$/, "")}` : "";
  let classes = common ? Object.keys(r.entity_counts).filter((k) => k === target || (SUBTYPES[target] || []).includes(k)) : [];
  // No such class in the file (IFC2x3 MEP is IFCFLOWTERMINAL; some targets are abstract): where the pset appears.
  if (!classes.length) classes = [...carried.keys()].filter((k) => isPset || JUDGED.has(k));
  // A property no building element carries (NetPlannedArea on IFCSPACE): every class that carries it.
  if (!classes.length) classes = [...carried.keys()];
  if (!classes.length) return false;
  classes.sort(); // code-unit order = C#'s ordinal

  for (const cls of classes) {
    const n = covered.get(cls) || 0, total = r.entity_counts[cls];
    r.coverage.push({ requirement: req, kind: isPset ? "pset" : "property", entity: cls, covered: n, total });
    // A failing class shows its share floored, so it never reads as the threshold ("199/200 (99%)", not "(100%)").
    if (n / total < min)
      r.failures.push(`${isPset ? "Required property set" : "Required property"} '${req}': ${n}/${total} ${cls} (${Math.floor(100 * n / total)}%) — below ${pctP0(min)}%.`);
  }
  return true;
}

/** A required property as lower-case {pset, prop}: "Pset_DoorCommon.FireRating" → {pset: "pset_doorcommon", prop:
 *  "firerating"}; "FireRating" → {pset: "", prop: "firerating"}. Mirrors IfcDeliveryGate.Parts. */
function parts(req) {
  const want = String(req).toLowerCase();
  const dot = want.indexOf(".");
  return dot > 0 && dot < want.length - 1 ? { pset: want.slice(0, dot), prop: want.slice(dot + 1) } : { pset: "", prop: want };
}

/** What coverage needs, read line by line (IfcDeliveryGate.CoverageIndex): each object's psets
 *  (IFCRELDEFINESBYPROPERTIES), its types (IFCRELDEFINESBYTYPE), each type's HasPropertySets, each pset's single
 *  values the contract names, and each rooted entity's class. No geometry and no other property is kept. */
function coverageIndex(requiredProperties) {
  // Each property's name as pset.property splits it, and whole ("COBie.Type.Name" may be one name).
  const wanted = new Set(requiredProperties.flatMap((p) => [parts(p).prop, String(p).toLowerCase()]));
  const classOf = new Map(), psets = new Map(), props = new Map();
  const own = new Map(), types = new Map(), typePsets = new Map(); // object → psets · object → types · type → HasPropertySets
  return {
    /** argsAt: where the arguments start, just after the entity's opening parenthesis. */
    read(id, entity, line, argsAt) {
      if (entity === "IFCPROPERTYSINGLEVALUE") { // ('Name', Description, NominalValue, Unit)
        const a = stepArgs(line, argsAt);
        const name = a.length > 0 ? unquote(a[0]).toLowerCase() : "";
        if (wanted.has(name)) props.set(id, { name, valued: a.length > 2 && valued(a[2]) });
        return;
      }
      if (entity === "IFCPROPERTYSET") { // (GlobalId, OwnerHistory, 'Name', Description, (HasProperties))
        const a = stepArgs(line, argsAt);
        if (a.length > 4) psets.set(id, { name: unquote(a[2]).toLowerCase(), props: refs(a[4]) });
        return;
      }
      if (entity === "IFCRELDEFINESBYPROPERTIES" || entity === "IFCRELDEFINESBYTYPE") { // (…, (RelatedObjects), Relating…)
        const a = stepArgs(line, argsAt);
        if (a.length < 6) return;
        const map = entity === "IFCRELDEFINESBYTYPE" ? types : own;
        const defs = refs(a[5]);
        for (const obj of refs(a[4])) { const l = map.get(obj); if (l) l.push(...defs); else map.set(obj, [...defs]); }
        return;
      }
      // A rooted entity (its GlobalId first) is an object or a type: only those carry psets.
      let at = argsAt;
      while (line[at] === " " || line[at] === "\t") at++;
      if (line[at] !== "'" || entity.startsWith("IFCREL")) return;
      classOf.set(id, entity);
      if (entity.endsWith("TYPE") || entity.endsWith("STYLE") || entity === "IFCTYPEPRODUCT" || entity === "IFCTYPEOBJECT") { // IfcTypeObject: (…, ApplicableOccurrence, (HasPropertySets), …)
        const a = stepArgs(line, argsAt);
        if (a.length > 5) typePsets.set(id, refs(a[5]));
      }
    },
    /** Every object that carries a pset, its own or its type's: its class and those psets. */
    elements() {
      const built = new Map();
      const psetOf = (id) => {
        if (built.has(id)) return built.get(id);
        const def = psets.get(id);
        let p = null;
        if (def) {
          p = { name: def.name, props: new Map() };
          for (const pid of def.props) {
            const v = props.get(pid);
            if (v) p.props.set(v.name, (p.props.get(v.name) ?? false) || v.valued);
          }
        }
        built.set(id, p);
        return p;
      };
      const addAll = (to, ids) => { for (const id of ids) { const p = psetOf(id); if (p) to.push(p); } };
      const list = [];
      for (const obj of new Set([...own.keys(), ...types.keys()])) {
        const cls = classOf.get(obj);
        if (!cls) continue;
        const ps = [];
        if (own.has(obj)) addAll(ps, own.get(obj));
        for (const t of types.get(obj) ?? []) if (typePsets.has(t)) addAll(ps, typePsets.get(t));
        list.push({ cls, psets: ps });
      }
      return list;
    },
  };
}

/** The top-level arguments of one STEP entity line from `start` (just after its opening parenthesis):
 *  "'a,b',$,(#1,#2),IFCLABEL('x'));" → ["'a,b'", "$", "(#1,#2)", "IFCLABEL('x')"]. Strings ('' inside one) and nesting
 *  are respected; an unterminated line gives what was read. Mirrors IfcDeliveryGate.StepArgs. */
export function stepArgs(line, start) {
  const args = [];
  let depth = 0, from = start, quoted = false;
  for (let i = start; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === "'") { if (line[i + 1] === "'") i++; else quoted = false; }
      continue;
    }
    if (ch === "'") quoted = true;
    else if (ch === "(") depth++;
    else if (ch === ")") {
      if (depth === 0) { args.push(line.slice(from, i).trim()); return args; }
      depth--;
    } else if (ch === "," && depth === 0) { args.push(line.slice(from, i).trim()); from = i + 1; }
  }
  return args;
}

/** Whether a record's text reaches its closing ';' outside a string. Mirrors IfcDeliveryGate.RecordEnds. */
function recordEnds(line) {
  if (!line.includes("'")) return line.includes(";"); // no string to step over: most geometry records
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'") quoted = !quoted; // '' inside a string flips twice
    else if (ch === ";" && !quoted) return true;
  }
  return false;
}

const refs = (arg) => [...arg.matchAll(REF_RX)].map((m) => Number(m[1]));
const unquote = (a) => (a.length >= 2 && a[0] === "'" && a[a.length - 1] === "'" ? a.slice(1, -1).replaceAll("''", "'") : a);

/** A NominalValue holds something unless it is $ or empty: IFCLABEL('') is no value. Mirrors IfcDeliveryGate.Valued. */
export function valued(arg) {
  const m = TYPED_VALUE_RX.exec(arg);
  const inner = (m ? m[1] : arg).trim();
  return inner.length > 0 && inner !== "$" && inner !== "''";
}
