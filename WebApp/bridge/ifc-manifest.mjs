// A model's identity for the Federation Gate, read straight from the IFC with web-ifc: elements by
// GlobalId (class, type name, storey), levels, grid tags, site position and map conversion. Identity
// only — no property sets — so it stays cheap on a 150 MB model. Never throws on one bad entity.
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as WebIFC from "web-ifc";

const here = dirname(fileURLToPath(import.meta.url));
const WASM_DIR = resolve(here, "../node_modules/web-ifc") + "/";

/** The extractor's classes plus the members and plates the delivery gate counts as building elements. */
export const MANIFEST_CLASSES = [
  "IFCWALL", "IFCSLAB", "IFCROOF", "IFCCOVERING", "IFCDOOR", "IFCWINDOW", "IFCSTAIR", "IFCCOLUMN", "IFCBEAM",
  "IFCFOOTING", "IFCSPACE", "IFCCURTAINWALL", "IFCRAILING", "IFCMEMBER", "IFCPLATE",
];

export const val = (o) => (o == null ? null : typeof o === "object" && !Array.isArray(o) && "value" in o ? o.value : o);
export const num = (o) => { const v = val(o); if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
export const ref = (o) => (o && typeof o === "object" && "value" in o ? o.value : typeof o === "number" ? o : null);
export const idsOf = (api, mid, type) => { const v = api.GetLineIDsWithType(mid, type, true); const out = []; for (let i = 0; i < v.size(); i++) out.push(v.get(i)); return out; };

/** A length unit entity → millimetres per unit; null when it is not a length unit; false when it is one this cannot read (an SI prefix
 *  it does not know, a conversion factor that is not a number above 0). IfcSIUnit: the prefix over METRE (MILLI 1, bare 1000,
 *  KILO 1e6). IfcConversionBasedUnit (FOOT, INCH): its factor times the SI unit it is measured in. */
const SI_PREFIX = { MICRO: 0.001, MILLI: 1, CENTI: 10, DECI: 100, DECA: 1e4, HECTO: 1e5, KILO: 1e6, MEGA: 1e9 };
function lengthUnitMm(api, mid, id, depth = 0) {
  const u = id == null || depth > 4 ? null : api.GetLine(mid, id);
  if (!u || val(u.UnitType) !== "LENGTHUNIT") return null;
  let f = false;
  if (u.type === WebIFC.IFCSIUNIT) { const p = val(u.Prefix); f = p == null ? 1000 : (SI_PREFIX[p] ?? false); }
  else if (u.type === WebIFC.IFCCONVERSIONBASEDUNIT) {
    const cf = api.GetLine(mid, ref(u.ConversionFactor));
    const base = lengthUnitMm(api, mid, ref(cf?.UnitComponent), depth + 1), k = num(cf?.ValueComponent);
    f = typeof base === "number" && k != null ? base * k : false;
  }
  return Number.isFinite(f) && f > 0 ? f : false;
}

/** Project length unit → { mm, how }: "project" from IfcProject.UnitsInContext → IfcUnitAssignment.Units (a FOOT file also holds the
 *  metre it is defined by, so scanning every unit would misread it as metres), "scan" from any length unit in the file when the project
 *  names none, "default" metres (the IFC default) when the file assigns none at all. A length unit the project assigns but this cannot
 *  read throws (MA-6-7): guessing metres would scale every length wrong. */
export function lengthUnit(api, mid) {
  let bad = false;
  try {
    const pid = idsOf(api, mid, WebIFC.IFCPROJECT)[0];
    const ua = pid == null ? null : api.GetLine(mid, ref(api.GetLine(mid, pid).UnitsInContext));
    for (const u of ua?.Units || []) {
      const f = lengthUnitMm(api, mid, ref(u));
      if (f === false) { bad = true; break; }
      if (f != null) return { mm: f, how: "project" };
    }
  } catch { /* an unreadable assignment falls to the scan below */ }
  if (bad) throw new Error("the file's length unit is one this does not read");
  try {
    for (const t of [WebIFC.IFCCONVERSIONBASEDUNIT, WebIFC.IFCSIUNIT]) for (const id of idsOf(api, mid, t)) { const f = lengthUnitMm(api, mid, id); if (typeof f === "number") return { mm: f, how: "scan" }; }
  } catch { /* nothing readable: metres */ }
  return { mm: 1000, how: "default" };
}

/** The manifest's view: the same unit, metres when it cannot be read (a manifest is identity, not geometry). */
export function mmPerUnit(api, mid) {
  try { return lengthUnit(api, mid).mm; } catch { return 1000; }
}

/** IfcCompoundPlaneAngleMeasure (deg, min, sec[, millionths]) → decimal degrees; the sign is carried by
 *  the first non-zero component, as the IFC spec defines it. */
export function compoundAngle(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const parts = list.map((x) => num(x) ?? 0);
  const first = parts.find((p) => p !== 0);
  const sign = first != null && first < 0 ? -1 : 1;
  const [d = 0, m = 0, s = 0, us = 0] = parts.map(Math.abs);
  return sign * (d + m / 60 + s / 3600 + us / 3.6e9);
}

export async function extractManifest(bytes) {
  const api = new WebIFC.IfcAPI();
  api.SetWasmPath(WASM_DIR, true);
  await api.Init();
  const mid = api.OpenModel(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const out = { schema: "", elements: [], levels: [], grids: [], site: null, counts: { elements: 0, skipped: 0 } };
  try {
    try { out.schema = String(api.GetModelSchema(mid) || "").toUpperCase(); } catch { out.schema = ""; }
    const mm = mmPerUnit(api, mid);

    const storeyOf = new Map();
    for (const id of idsOf(api, mid, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
      try {
        const r = api.GetLine(mid, id);
        const name = val(api.GetLine(mid, ref(r.RelatingStructure))?.Name) ?? null;
        for (const e of r.RelatedElements || []) storeyOf.set(ref(e), name);
      } catch { out.counts.skipped++; }
    }
    const typeOf = new Map();
    for (const id of idsOf(api, mid, WebIFC.IFCRELDEFINESBYTYPE)) {
      try {
        const r = api.GetLine(mid, id);
        const name = val(api.GetLine(mid, ref(r.RelatingType))?.Name) ?? null;
        for (const e of r.RelatedObjects || []) typeOf.set(ref(e), name);
      } catch { out.counts.skipped++; }
    }

    const seen = new Set();
    for (const cls of MANIFEST_CLASSES) {
      const code = WebIFC[cls];
      if (typeof code !== "number") continue;
      for (const id of idsOf(api, mid, code)) {
        if (seen.has(id)) continue;
        seen.add(id);
        try {
          const line = api.GetLine(mid, id);
          const objectType = val(line.ObjectType);
          out.elements.push({
            guid: val(line.GlobalId) ?? String(id),
            class: String(api.GetNameFromTypeCode(line.type) || cls).toUpperCase(),
            type_name: (objectType != null && objectType !== "") ? String(objectType) : (typeOf.get(id) ?? null),
            storey: storeyOf.get(id) ?? null,
          });
          out.counts.elements++;
        } catch { out.counts.skipped++; }
      }
    }

    // GlobalIds as the file carries them, before anything keys on them: the stored manifest keeps one row per GlobalId
    // (element_snapshots' primary key), so duplicates and blanks are counted here or never. Counted over EVERY IfcProduct
    // (walls and slabs, and proxies, MEP, furniture, openings, spatial elements — whatever a clash or an issue can key
    // on), from the raw GlobalId: a $ is missing, never the express id the element row falls back to. The Federation
    // Gate's one-model FG-01 reads this (3D spec Decision 4, option B, 2026-09-28; widened by its review).
    {
      const n = new Map();
      let missing = 0, counted = 0;
      for (const id of idsOf(api, mid, WebIFC.IFCPRODUCT)) {
        let raw;
        try { raw = val(api.GetLine(mid, id)?.GlobalId); } catch { continue; }
        counted++;
        const g = raw == null ? "" : String(raw).trim();
        if (!g) { missing++; continue; }
        n.set(g, (n.get(g) ?? 0) + 1);
      }
      const dups = [...n].filter(([, c]) => c > 1);
      out.guid_audit = { scope: "IfcProduct", counted, duplicates: dups.reduce((a, [, c]) => a + c - 1, 0), examples: dups.slice(0, 5).map(([g]) => g), missing };
    }

    for (const id of idsOf(api, mid, WebIFC.IFCBUILDINGSTOREY)) {
      try {
        const s = api.GetLine(mid, id);
        const e = num(s.Elevation);
        out.levels.push({ name: String(val(s.Name) ?? `#${id}`), elevation_mm: e == null ? 0 : Math.round(e * mm * 1000) / 1000 });
      } catch { out.counts.skipped++; }
    }
    out.levels.sort((a, b) => a.elevation_mm - b.elevation_mm);

    const tags = new Set();
    for (const id of idsOf(api, mid, WebIFC.IFCGRIDAXIS)) {
      try { const t = val(api.GetLine(mid, id).AxisTag); if (t != null && String(t) !== "") tags.add(String(t)); } catch { out.counts.skipped++; }
    }
    out.grids = [...tags].sort();

    const siteIds = idsOf(api, mid, WebIFC.IFCSITE);
    if (siteIds.length) {
      const s = api.GetLine(mid, siteIds[0]);
      const el = num(s.RefElevation);
      const site = { lat: compoundAngle(val(s.RefLatitude)), lon: compoundAngle(val(s.RefLongitude)), elevation_m: el == null ? null : (el * mm) / 1000, map_conversion: null };
      const mcIds = idsOf(api, mid, WebIFC.IFCMAPCONVERSION);
      if (mcIds.length) {
        const mc = api.GetLine(mid, mcIds[0]);
        let crs = null;
        try { crs = val(api.GetLine(mid, ref(mc.TargetCRS))?.Name) ?? null; } catch { crs = null; }
        site.map_conversion = { eastings: num(mc.Eastings) ?? 0, northings: num(mc.Northings) ?? 0, height: num(mc.OrthogonalHeight) ?? 0, x_axis_abscissa: num(mc.XAxisAbscissa) ?? 1, x_axis_ordinate: num(mc.XAxisOrdinate) ?? 0, scale: num(mc.Scale) ?? 1, crs_name: crs == null ? null : String(crs) };
      }
      out.site = site;
    }
  } finally {
    api.CloseModel(mid);
  }
  return out;
}
