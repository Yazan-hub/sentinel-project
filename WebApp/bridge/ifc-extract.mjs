// Elements from an IFC, in the referee's ElementProperties shape, read through web-ifc in Node.
// The Revit side reads the same shape out of Revit parameters (GovernedElementExtractor); this is
// the path for a file that never saw Revit. Identity attributes from the entity line, psets through
// IsDefinedBy (instance) and IsTypedBy (type), quantities from IfcElementQuantity, IDS classification and material from
// their association lines. Never throws on
// one bad element: it is counted as skipped.
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as WebIFC from "web-ifc";
import { materialValues, projectUnits, siValue, partOfChains } from "./sentinel-core.mjs";

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
// A quantity's IFC measure type, as IfcTester reads it off the schema (an IDS dataType on a Qto_ property).
const QTY_TYPES = { LengthValue: "IFCLENGTHMEASURE", AreaValue: "IFCAREAMEASURE", VolumeValue: "IFCVOLUMEMEASURE",
  CountValue: "IFCCOUNTMEASURE", WeightValue: "IFCMASSMEASURE", TimeValue: "IFCTIMEMEASURE" };

// `si(value, measure, ownUnit)`: the value in SI units (PropRow.si), from extractHere's project units; none = rows as read.
function groupsOf(defs, target, si) {
  // defs: IfcPropertySet | IfcElementQuantity lines (recursive: true expands HasProperties/Quantities)
  const withSi = (row, unit) => { const v = si?.(row.value, row.type, unit); return v === undefined ? row : { ...row, si: v }; };
  for (const d of defs || []) {
    const name = val(d?.Name);
    if (!name) continue;
    if (Array.isArray(d.HasProperties)) {
      const rows = [];
      for (const p of d.HasProperties) {
        const n = val(p?.Name); if (!n) continue;
        const v = p?.NominalValue !== undefined ? bool(p.NominalValue) : undefined;
        const type = typeof p?.NominalValue?.name === "string" ? p.NominalValue.name.toUpperCase() : null; // web-ifc's "IFCLABEL": an IDS dataType
        const values = multiValues(p, si);
        if (values) rows.push({ name: n, value: values.map((x) => x.value).join(", "), ...(values[0]?.type && !values[0].column ? { type: (p.UpperBoundValue !== undefined ? values.at(-1) : values[0]).type } : {}), values });
        else rows.push(withSi(type ? { name: n, value: v ?? "", type } : { name: n, value: v ?? "" }, p?.Unit));
      }
      target.psets.push({ name, rows });
    } else if (Array.isArray(d.Quantities)) {
      const rows = [];
      for (const q of d.Quantities) {
        const n = val(q?.Name); if (!n) continue;
        const key = QTY_KEYS.find((k) => q?.[k] !== undefined);
        rows.push(key ? withSi({ name: n, value: val(q[key]) ?? "", type: QTY_TYPES[key] }, q?.Unit) : { name: n, value: "" });
      }
      target.quantities.push({ name, rows });
    }
  }
}

// getTypeProperties(mid, id, true) returns the type LINE(S) (e.g. IFCWALLTYPE), each carrying its
// psets under HasPropertySets — not a flat list of psets like getPropertySets does. At installed
// web-ifc 0.0.77 those entries are already-expanded pset objects; if a future version instead leaves
// an unexpanded {type, value: expressID} handle, resolve it with GetLine (brief's documented fallback).
function typePsetDefs(api, mid, typeDefs) {
  const out = [];
  for (const t of typeDefs || []) {
    for (const ref of t?.HasPropertySets || []) {
      out.push(ref && typeof ref === "object" && "expressID" in ref ? ref : api.GetLine(mid, ref?.value, true));
    }
  }
  return out;
}

/** An enumerated, list, bounded or table property's values (PropRow.values), as IfcTester reads them: each value with its IFC type
 *  and SI form (a list's and a bound's from the property's unit, a table column's from its own); a bound in IfcTester's order
 *  (upper, lower, set point), so the last is the one whose type is the property's. undefined = a single value. */
function multiValues(p, si) {
  const one = (x, unit, column) => {
    const type = typeof x?.name === "string" ? x.name.toUpperCase() : undefined, value = bool(x) ?? "", s = si?.(value, type, unit);
    return { value, ...(type ? { type } : {}), ...(s !== undefined ? { si: s } : {}), ...(column ? { column } : {}) };
  };
  if (Array.isArray(p?.EnumerationValues)) return p.EnumerationValues.map((x) => one(x)); // IfcTester converts no enumerated value
  if (Array.isArray(p?.ListValues)) return p.ListValues.map((x) => one(x, p.Unit));
  if (p && "UpperBoundValue" in p) return [p.UpperBoundValue, p.LowerBoundValue, p.SetPointValue].filter((x) => x != null).map((x) => one(x, p.Unit));
  if (p && "DefiningValues" in p) return [...(p.DefiningValues ?? []).map((x) => one(x, p.DefiningUnit, "Defining")), ...(p.DefinedValues ?? []).map((x) => one(x, p.DefinedUnit, "Defined"))];
  return undefined;
}

/** Instance groups first, then the type's; a row already present by (pset, name) is not overridden. */
function mergeTypeGroups(el, psetDefs, si) {
  const tmp = { psets: [], quantities: [] };
  groupsOf(psetDefs, tmp, si);
  for (const g of tmp.psets) {
    let mine = el.psets.find((x) => x.name === g.name);
    if (!mine) { mine = { name: g.name, rows: [] }; el.psets.push(mine); }
    for (const r of g.rows) if (!mine.rows.some((x) => x.name === r.name)) mine.rows.push(r);
  }
}

/** MA-6-7: one element's property sets and quantities — its own, then its type's (a row already present is not overridden). */
export async function elementPsets(api, mid, id, si) {
  const el = { psets: [], quantities: [] };
  groupsOf(await api.properties.getPropertySets(mid, id, true, false), el, si);
  // A type object's own sets hang off its HasPropertySets attribute, which getPropertySets (IsDefinedBy) does not read.
  const own = api.GetLine(mid, id)?.HasPropertySets;
  if (Array.isArray(own)) groupsOf(own.map((r) => (r && typeof r === "object" && "expressID" in r ? r : api.GetLine(mid, r?.value, true))), el, si);
  const typeDefs = await api.properties.getTypeProperties(mid, id, true);
  mergeTypeGroups(el, typePsetDefs(api, mid, typeDefs), si);
  // The type object's own predefined type (an IDS predefinedType is inherited from it — entity/pass-inherited_predefined_types).
  const t = typeDefs?.[0];
  if (t && typeof t === "object") el.type = { Class: String(api.GetNameFromTypeCode(t.type) || "").toUpperCase(), PredefinedType: val(t.PredefinedType), ElementType: val(t.ElementType), ProcessType: val(t.ProcessType) };
  return el;
}

/** IDS classification, material and partOf parents for every element, as IfcTester reads them, from the model's relationship lines
 *  (read once). Classification: the element's references, the type's kept for a system the element does not reference (IfcTester's
 *  get_references), each with every reference above it and its system's Name. Material: the element's first, else its type's.
 *  Parents: the first relating object of each relation partOf reads (partOfChains walks them). */
function associations(api, mid) {
  const lines = (cls) => { const ids = api.GetLineIDsWithType(mid, WebIFC[cls], true), out = []; for (let i = 0; i < ids.size(); i++) out.push(api.GetLine(mid, ids.get(i))); return out; };
  const name = (line) => String(api.GetNameFromTypeCode(line?.type) || "").toUpperCase();
  const typeOf = new Map(), refs = new Map(), mats = new Map(), sys = new Map(), matCache = new Map();
  for (const r of lines("IFCRELDEFINESBYTYPE")) for (const o of r.RelatedObjects ?? []) typeOf.set(o.value, r.RelatingType?.value);
  for (const r of lines("IFCRELASSOCIATESCLASSIFICATION")) for (const o of r.RelatedObjects ?? []) refs.set(o.value, [...(refs.get(o.value) ?? []), r.RelatingClassification?.value]);
  for (const r of lines("IFCRELASSOCIATESMATERIAL")) for (const o of r.RelatedObjects ?? []) if (!mats.has(o.value)) mats.set(o.value, r.RelatingMaterial?.value);
  const parents = new Map(), link = (child, k, parent) => { const p = parents.get(child) ?? {}; p[k] ??= parent ?? null; parents.set(child, p); };
  for (const [cls, k, from, to] of [["IFCRELAGGREGATES", "aggregate", "RelatedObjects", "RelatingObject"], ["IFCRELNESTS", "nest", "RelatedObjects", "RelatingObject"],
    ["IFCRELCONTAINEDINSPATIALSTRUCTURE", "container", "RelatedElements", "RelatingStructure"], ["IFCRELASSIGNSTOGROUP", "group", "RelatedObjects", "RelatingGroup"],
    ["IFCRELFILLSELEMENT", "fills", "RelatedBuildingElement", "RelatingOpeningElement"], ["IFCRELVOIDSELEMENT", "voids", "RelatedOpeningElement", "RelatingBuildingElement"]])
    for (const r of lines(cls)) for (const o of [r[from]].flat()) if (o?.value != null) link(o.value, k, r[to]?.value);
  const NONE = { aggregate: null, nest: null, container: null, group: null, fills: null, voids: null };
  // A reference and every reference above it (ReferencedSource), up to its IfcClassification: [{value, system}], and the system's id.
  const chain = (id) => {
    if (sys.has(id)) return sys.get(id);
    const rows = []; let line = api.GetLine(mid, id);
    for (let n = 0; line && name(line) !== "IFCCLASSIFICATION" && n < 64; n++) { rows.push(line); line = line.ReferencedSource?.value ? api.GetLine(mid, line.ReferencedSource.value) : null; }
    const root = line && name(line) === "IFCCLASSIFICATION" ? line : null, system = val(root?.Name);
    const got = { key: root?.expressID ?? null, rows: rows.length ? rows.map((r) => ({ value: val(r.Identification) ?? val(r.ItemReference), system })) : [{ system }] };
    sys.set(id, got);
    return got;
  };
  return (id) => {
    const own = (refs.get(id) ?? []).filter((r) => r != null), type = typeOf.get(id);
    const bySystem = new Map();
    for (const r of type != null ? (refs.get(type) ?? []).filter((x) => x != null) : []) bySystem.set(chain(r).key, [...(bySystem.get(chain(r).key) ?? []), r]);
    for (const k of new Set(own.map((r) => chain(r).key))) bySystem.set(k, own.filter((r) => chain(r).key === k));
    const m = mats.get(id) ?? (type != null ? mats.get(type) : undefined);
    if (m != null && !matCache.has(m)) matCache.set(m, materialValues(tagged(api, api.GetLine(mid, m, true))));
    return { classifications: [...bySystem.values()].flat().flatMap((r) => chain(r).rows), material: m == null ? null : matCache.get(m), parents: { ...NONE, ...parents.get(id) } };
  };
}

/** web-ifc's flattened line → the shape materialValues reads: every entity's class name in `_category`, as fragments give it. */
function tagged(api, o, seen = new Set()) {
  if (Array.isArray(o)) o.forEach((x) => tagged(api, x, seen));
  else if (o && typeof o === "object" && "expressID" in o && !seen.has(o)) {
    seen.add(o);
    o._category = { value: String(api.GetNameFromTypeCode(o.type) || "").toUpperCase() };
    for (const v of Object.values(o)) tagged(api, v, seen);
  }
  return o;
}

export async function extractElements(bytes, opts) {
  const { runIfcJob } = await import("./ifc-worker.mjs"); // off the bridge's thread (large-model benchmark 2026-10)
  return runIfcJob("extract", bytes, opts);
}

/** The extraction itself, on the calling thread — ifc-worker.mjs runs it. */
export async function extractHere(bytes, { classes = DEFAULT_CLASSES, modelId = "intake" } = {}) {
  const api = new WebIFC.IfcAPI();
  api.SetWasmPath(WASM_DIR, true);
  await api.Init();
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const mid = api.OpenModel(u8);
  const out = { elements: [], schema: "", counts: { elements: 0, skipped: 0, by_class: {}, unknown_classes: [] } };
  try {
    try { out.schema = String(api.GetModelSchema(mid) || "").toUpperCase(); } catch { out.schema = ""; }
    const seen = new Set();
    const assoc = associations(api, mid);
    // IDS 1.0 compares values in SI units: the project's units (IfcUnitAssignment), else a property's own unit.
    const line = (r) => (r && typeof r === "object" && "expressID" in r ? r : r?.value ? api.GetLine(mid, r.value, true) : undefined);
    const projects = api.GetLineIDsWithType(mid, WebIFC.IFCPROJECT, true);
    const units = projects.size() ? projectUnits(tagged(api, line(api.GetLine(mid, projects.get(0)).UnitsInContext))) : undefined;
    const si = (value, measure, unit) => siValue(value, measure, unit ? tagged(api, line(unit)) : undefined, units);
    for (const cls of classes) {
      const typeCode = WebIFC[cls.toUpperCase()];
      if (typeof typeCode !== "number") { out.counts.unknown_classes.push(cls); continue; } // said, never silently skipped
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
            schema: out.schema,
            identity: {
              GlobalId: val(line.GlobalId), Name: val(line.Name), Class: concrete,
              ObjectType: val(line.ObjectType), PredefinedType: val(line.PredefinedType), Tag: val(line.Tag),
            },
            psets: [], quantities: [],
          };
          // Every other direct attribute with a plain value (Description, LongName, …) — an IDS attribute facet may name any.
          // References (type 5) and lists are left out: present-but-not-a-value, as Sentinel cannot compare them.
          for (const [k, v] of Object.entries(line)) {
            if (!(k in el.identity) && v && typeof v === "object" && !Array.isArray(v) && v.type !== 5 && v.value != null && typeof v.value !== "object")
              el.identity[k] = String(v.value);
          }
          Object.assign(el, await elementPsets(api, mid, id, si), assoc(id));
          out.elements.push(el);
          out.counts.elements++;
          out.counts.by_class[concrete] = (out.counts.by_class[concrete] || 0) + 1;
        } catch {
          out.counts.skipped++;
        }
      }
    }
    partOfChains(out.elements);
  } finally {
    api.CloseModel(mid);
  }
  return out;
}
