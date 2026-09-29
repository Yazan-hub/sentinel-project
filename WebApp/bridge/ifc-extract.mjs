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

/** Instance groups first, then the type's; a row already present by (pset, name) is not overridden. */
function mergeTypeGroups(el, psetDefs) {
  const tmp = { psets: [], quantities: [] };
  groupsOf(psetDefs, tmp);
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
  const out = { elements: [], schema: "", counts: { elements: 0, skipped: 0, by_class: {}, unknown_classes: [] } };
  try {
    try { out.schema = String(api.GetModelSchema(mid) || "").toUpperCase(); } catch { out.schema = ""; }
    const seen = new Set();
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
            identity: {
              GlobalId: val(line.GlobalId), Name: val(line.Name), Class: concrete,
              ObjectType: val(line.ObjectType), PredefinedType: val(line.PredefinedType), Tag: val(line.Tag),
            },
            psets: [], quantities: [],
          };
          groupsOf(await api.properties.getPropertySets(mid, id, true, false), el);
          const typeDefs = await api.properties.getTypeProperties(mid, id, true);
          mergeTypeGroups(el, typePsetDefs(api, mid, typeDefs));
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
