// MA-6-7 — the IFC geometry reader: an IFC's levels, straight walls and floors as the numbers a changeset needs (centre line,
// thickness, height, outline), read with web-ifc in process, pure over the file's bytes. Lengths are millimetres in the IFC's own
// frame (the composed placement chain); a context WCS or site that is not the origin is reported in `hint`, not applied. What it
// does not read it lists in `not_read`, each with its words; one bad entity is listed, never thrown. The file is untrusted: the
// placement chain and the clipping unwrap stop at depth 64, and every name that leaves is one clean line.
// CLI: node bridge/ifc-geometry.mjs <file.ifc>
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import * as WebIFC from "web-ifc";
import { mmPerUnit, val, num, ref, idsOf } from "./ifc-manifest.mjs";
import { elementPsets } from "./ifc-extract.mjs";

export const IFC = "sentinel-ifc";
export const VERSION = "0.1.0";

const WASM_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../node_modules/web-ifc") + "/";
const MAX_DEPTH = 64;

class NotRead extends Error {}
const no = (why) => { throw new NotRead(why); };
const clean = (s, n = 256) => String(s ?? "").replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").trim().slice(0, n);
const r1 = (x) => Math.round(x * 10) / 10;

// ── vectors and frames ({o, x, y, z}: an origin and three unit axes, in millimetres) ─────────────────────────────────────────
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const n = Math.hypot(a[0], a[1], a[2]); return n < 1e-12 ? null : [a[0] / n, a[1] / n, a[2] / n]; };
const pad3 = (a) => [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0];
const IDENT = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const rot = (F, v) => [0, 1, 2].map((i) => v[0] * F.x[i] + v[1] * F.y[i] + v[2] * F.z[i]);
const at = (F, p) => { const r = rot(F, p); return [F.o[0] + r[0], F.o[1] + r[1], F.o[2] + r[2]]; };
const compose = (P, C) => ({ o: at(P, C.o), x: rot(P, C.x), y: rot(P, C.y), z: rot(P, C.z) });
const upright = (F) => Math.abs(F.z[2]) >= 0.9999;
const mid2 = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

const truth = (s) => { const t = String(s ?? "").toLowerCase(); return t === "true" || t === "t" ? true : t === "false" || t === "f" ? false : null; };

export async function readIfcGeometry(bytes) {
  const api = new WebIFC.IfcAPI();
  api.SetWasmPath(WASM_DIR, true);
  await api.Init();
  let mid;
  try { mid = api.OpenModel(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); } catch (e) { throw new Error(`web-ifc could not open the file: ${clean(e?.message, 200)}`); }
  if (mid == null || mid < 0) throw new Error("web-ifc could not open the file: it is not a readable IFC (STEP) model");
  try {
    return await read(api, mid);
  } finally {
    api.CloseModel(mid);
  }
}

async function read(api, mid) {
  const mm = mmPerUnit(api, mid);
  const cache = new Map();
  const L = (id) => { if (id == null) return null; if (!cache.has(id)) { try { cache.set(id, api.GetLine(mid, id)); } catch { cache.set(id, null); } } return cache.get(id); };
  const R = (o) => L(ref(o));
  const refs = (list) => (Array.isArray(list) ? list.map(R).filter(Boolean) : []);
  const className = (l, id) => String(api.GetNameFromTypeCode(l?.type) || `#${id}`).toUpperCase();
  const prose = (l, id) => l?.constructor?.name && l.constructor.name !== "Object" ? l.constructor.name : `Ifc${className(l, id).replace(/^IFC/, "").toLowerCase()}`;

  const point = (o) => { const p = R(o); return pad3((p?.Coordinates || []).map((c) => (num(c) ?? 0) * mm)); };
  const dirOf = (o) => pad3((R(o)?.DirectionRatios || []).map((c) => num(c) ?? 0));

  // IfcAxis2Placement3D → frame. An omitted Axis or RefDirection defaults to Z or X (Revit writes `(#p,$,$)`).
  const frame3 = (id) => {
    const a = L(id);
    if (!a) no("a placement that cannot be read");
    const z = unit(a.Axis ? dirOf(a.Axis) : [0, 0, 1]);
    const xr = a.RefDirection ? dirOf(a.RefDirection) : [1, 0, 0];
    const x = z && unit([0, 1, 2].map((i) => xr[i] - dot(xr, z) * z[i]));
    if (!z || !x) no("a placement with no usable axes");
    return { o: point(a.Location), x, y: cross(z, x), z };
  };
  // IfcAxis2Placement2D (a profile's Position) → frame in the profile's plane.
  const frame2 = (o) => {
    const a = R(o);
    if (!a) return IDENT;
    const x = unit(a.RefDirection ? dirOf(a.RefDirection) : [1, 0, 0]) ?? [1, 0, 0];
    return { o: point(a.Location), x, y: [-x[1], x[0], 0], z: [0, 0, 1] };
  };
  const placements = new Map();
  const placementOf = (id) => {
    if (id == null) no("no placement");
    if (placements.has(id)) return placements.get(id);
    const chain = [];
    let cur = id;
    while (cur != null && !placements.has(cur)) {
      if (chain.length >= MAX_DEPTH) no("placement chain loops");
      const p = L(cur);
      if (!p) no("a placement that cannot be read");
      if (p.type === WebIFC.IFCGRIDPLACEMENT) no("placed on a grid");
      if (p.type !== WebIFC.IFCLOCALPLACEMENT) no("a placement that is not a local placement");
      chain.push(cur);
      cur = ref(p.PlacementRelTo);
    }
    let F = cur == null ? IDENT : placements.get(cur);
    for (let i = chain.length - 1; i >= 0; i--) { F = compose(F, frame3(ref(L(chain[i]).RelativePlacement))); placements.set(chain[i], F); }
    return placements.get(id);
  };
  const placedUpright = (o) => { const F = placementOf(ref(o)); if (!upright(F)) no("placed tilted"); return F; };

  // ── spatial structure ───────────────────────────────────────────────────────────────────────────────────────────────────
  const out = { reader: IFC, version: VERSION, schema: "", mm_per_unit: mm, levels: [], walls: [], floors: [], not_read: [], hint: { site: null, map_conversion: null, storey_elevation_mismatch: [], context_wcs_not_origin: false } };
  try { out.schema = String(api.GetModelSchema(mid) || "").toUpperCase(); } catch { out.schema = ""; }

  const storeys = [];
  for (const id of idsOf(api, mid, WebIFC.IFCBUILDINGSTOREY)) {
    const s = L(id);
    if (!s) continue;
    const attr = num(s.Elevation), elev = attr == null ? null : attr * mm;
    let placed = null;
    try { placed = placementOf(ref(s.ObjectPlacement)).o[2]; } catch { placed = null; }
    storeys.push({ id, global_id: val(s.GlobalId) == null ? `#${id}` : String(val(s.GlobalId)), name: clean(val(s.Name) ?? `#${id}`), z: placed ?? elev ?? 0, attr: elev, placed });
  }
  storeys.sort((a, b) => a.z - b.z || a.id - b.id);
  const cidOf = new Map();
  storeys.forEach((s, i) => {
    const cid = `L${String(i).padStart(2, "0")}`;
    cidOf.set(s.id, cid);
    out.levels.push({ cid, global_id: s.global_id, name: s.name, elevation_mm: r1(s.z) });
    if (s.attr != null && s.placed != null && Math.abs(s.attr - s.placed) > 1) out.hint.storey_elevation_mismatch.push({ cid, name: s.name, elevation_attr_mm: r1(s.attr), placed_mm: r1(s.placed) });
  });

  const storeyOf = new Map();   // element id → storey cid, or null for one a building or site holds
  for (const id of idsOf(api, mid, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
    const r = L(id);
    if (!r) continue;
    const cid = cidOf.get(ref(r.RelatingStructure)) ?? null;
    for (const e of r.RelatedElements || []) storeyOf.set(ref(e), cid);
  }
  const materialOf = new Map(), typeOf = new Map();
  for (const id of idsOf(api, mid, WebIFC.IFCRELASSOCIATESMATERIAL)) { const r = L(id); if (r) for (const e of r.RelatedObjects || []) materialOf.set(ref(e), ref(r.RelatingMaterial)); }
  for (const id of idsOf(api, mid, WebIFC.IFCRELDEFINESBYTYPE)) { const r = L(id); if (r) for (const e of r.RelatedObjects || []) typeOf.set(ref(e), ref(r.RelatingType)); }

  // ── curves, profiles, bodies ────────────────────────────────────────────────────────────────────────────────────────────
  const dropClosing = (pts) => (pts.length > 1 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 1e-6 ? pts.slice(0, -1) : pts);
  const loopOf = (curve) => {   // a closed outline of straight edges, 2D, the closing point dropped
    const c = R(curve);
    let pts;
    if (c?.type === WebIFC.IFCPOLYLINE) pts = (c.Points || []).map((p) => point(p).slice(0, 2));
    else if (c?.type === WebIFC.IFCINDEXEDPOLYCURVE) {
      const all = (R(c.Points)?.CoordList || []).map((p) => [(num(p[0]) ?? 0) * mm, (num(p[1]) ?? 0) * mm]);
      pts = all;
      if (Array.isArray(c.Segments) && c.Segments.length) {
        // web-ifc hands IfcLineIndex and IfcArcIndex over as bare 1-based index lists, so an arc is three points that are not on a line
        pts = [];
        for (const s of c.Segments) {
          const seg = (Array.isArray(s?.value) ? s.value : []).map((n) => all[Number(n?.value ?? n) - 1]).filter(Boolean);
          if (seg.length === 3 && Math.abs((seg[1][0] - seg[0][0]) * (seg[2][1] - seg[0][1]) - (seg[1][1] - seg[0][1]) * (seg[2][0] - seg[0][0])) > 1) no("a curved outline — straight edges only");
          for (const q of seg) if (!pts.length || Math.hypot(q[0] - pts.at(-1)[0], q[1] - pts.at(-1)[1]) > 1e-6) pts.push(q);
        }
      }
    } else no("a curved outline — straight edges only");
    pts = dropClosing(pts);
    if (pts.length < 3) no("an outline with fewer than 3 corners");
    return pts;
  };
  const profileOf = (id) => {   // → { outer: [[x,y]…] in the solid's plane, inners }
    const p = L(id);
    if (p?.type === WebIFC.IFCRECTANGLEPROFILEDEF) {
      const hx = (num(p.XDim) ?? 0) * mm / 2, hy = (num(p.YDim) ?? 0) * mm / 2, F2 = frame2(p.Position);
      if (!(hx > 0 && hy > 0)) no("a rectangle with no size");
      return { outer: [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map((q) => at(F2, [q[0], q[1], 0]).slice(0, 2)), inners: [] };
    }
    if (p?.type === WebIFC.IFCARBITRARYPROFILEDEFWITHVOIDS) return { outer: loopOf(p.OuterCurve), inners: (p.InnerCurves || []).map((c) => loopOf(c)) };
    if (p?.type === WebIFC.IFCARBITRARYCLOSEDPROFILEDEF) return { outer: loopOf(p.OuterCurve), inners: [] };
    return no("a profile it does not read");
  };
  // The first body item that is a solid we read: an extrusion (through any clipping), a faceted brep or a tessellation.
  const bodyOf = (line, F) => {
    const pds = R(line.Representation);
    const reps = refs(pds?.Representations);
    const idf = (r) => String(val(r.RepresentationIdentifier) ?? "");
    for (const rep of [...reps.filter((r) => idf(r) === "Body"), ...reps.filter((r) => idf(r) !== "Body" && idf(r) !== "Axis")]) {
      for (let it of refs(rep.Items)) {
        let clipped = false, d = 0;
        while (it && (it.type === WebIFC.IFCBOOLEANCLIPPINGRESULT || it.type === WebIFC.IFCBOOLEANRESULT)) {
          if (++d > MAX_DEPTH) no("clipping nested too deep");
          clipped = true;
          it = R(it.FirstOperand);
        }
        if (!it) continue;
        if (it.type === WebIFC.IFCEXTRUDEDAREASOLID) {
          const T = compose(F, it.Position ? frame3(ref(it.Position)) : IDENT);
          if (!upright(T)) no("a body placed tilted");
          const depth = (num(it.Depth) ?? 0) * mm;
          const dz = rot(T, unit(dirOf(it.ExtrudedDirection)) ?? [0, 0, 1])[2];
          if (!(depth > 0)) continue;
          return { kind: "extrusion", clipped, T, profile: ref(it.SweptArea), depth, z0: T.o[2], z1: T.o[2] + depth * dz };
        }
        const zs = [];
        if (it.type === WebIFC.IFCFACETEDBREP) {
          for (const f of refs(R(it.Outer)?.CfsFaces)) for (const b of refs(f.Bounds)) { const lp = R(b.Bound); if (lp?.type === WebIFC.IFCPOLYLOOP) for (const p of lp.Polygon || []) zs.push(at(F, point(p))[2]); }
        } else if (it.type === WebIFC.IFCTRIANGULATEDFACESET || it.type === WebIFC.IFCPOLYGONALFACESET) {
          for (const p of R(it.Coordinates)?.CoordList || []) zs.push(at(F, p.map((c) => (num(c) ?? 0) * mm))[2]);
        } else continue;
        if (zs.length) return { kind: it.type === WebIFC.IFCFACETEDBREP ? "brep" : "tessellated", clipped, z0: Math.min(...zs), z1: Math.max(...zs) };
      }
    }
    return null;
  };
  const axisOf = (line, F) => {   // the wall's Axis in world xy → [start, end] | null when it has none
    const rep = refs(R(line.Representation)?.Representations).find((r) => String(val(r.RepresentationIdentifier) ?? "") === "Axis");
    const c = rep && refs(rep.Items)[0];
    if (!c) return null;
    let a, b;
    if (c.type === WebIFC.IFCPOLYLINE) {
      if ((c.Points || []).length > 2) no("a wall with a bent axis — straight walls only");
      [a, b] = (c.Points || []).map(point);
    } else if (c.type === WebIFC.IFCTRIMMEDCURVE) {
      const basis = R(c.BasisCurve);
      if (basis?.type !== WebIFC.IFCLINE) no("a curved wall — straight walls only");
      const pnt = point(basis.Pnt), vec = R(basis.Dir), u = unit(dirOf(vec?.Orientation)) ?? [1, 0, 0], m = (num(vec?.Magnitude) ?? 1) * mm;
      const end = (trims) => {
        const t = Array.isArray(trims) ? trims : [];
        const pe = t.find((x) => x && typeof x === "object" && x.type === 5);
        if (pe) return point(pe);
        const p = t.find((x) => num(x) != null);
        return p == null ? null : [0, 1, 2].map((i) => pnt[i] + num(p) * m * u[i]);
      };
      a = end(c.Trim1); b = end(c.Trim2);
    } else no("a curved wall — straight walls only");
    if (!a || !b) no("a wall whose axis has no ends");
    return [at(F, a).slice(0, 2), at(F, b).slice(0, 2)];
  };
  const layerSum = (setId) => (refs(L(setId)?.MaterialLayers).reduce((s, l) => s + (num(l.LayerThickness) ?? 0) * mm, 0));

  // ── walls and floors ────────────────────────────────────────────────────────────────────────────────────────────────────
  const quantity = (g, name) => {
    for (const q of g.quantities) if (q.name === "BaseQuantities" || /^Qto_\w*BaseQuantities$/.test(q.name)) {
      const v = Number(q.rows.find((r) => r.name === name)?.value);
      if (Number.isFinite(v) && v > 0) return v * mm;
    }
    return null;
  };
  const external = (g, pset) => truth(g.psets.find((p) => p.name === pset)?.rows.find((r) => r.name === "IsExternal")?.value);
  const seen = new Set();
  const skip = (id, l, storey, why) => out.not_read.push({ global_id: val(l?.GlobalId) == null ? `#${id}` : clean(val(l.GlobalId)), ifc_class: className(l, id), storey, why: clean(why, 500) });

  const wallIds = new Set(idsOf(api, mid, WebIFC.IFCWALL));
  const slabIds = new Set(idsOf(api, mid, WebIFC.IFCSLAB));
  for (const id of [...wallIds, ...slabIds]) {
    const l = L(id);
    if (!l) continue;
    const storey = storeyOf.get(id) ?? null;
    try {
      const gid = val(l.GlobalId) == null ? `#${id}` : String(val(l.GlobalId));
      if (seen.has(gid)) no("GlobalId repeated");
      seen.add(gid);
      const name = clean(val(l.Name) ?? gid), isWall = wallIds.has(id);
      if (!isWall && String(val(l.PredefinedType)) === "ROOF") no("a roof slab — roofs are not proposed");
      if (storey == null) no("not on a storey");
      const F = placedUpright(l.ObjectPlacement);
      const body = bodyOf(l, F);
      const g = await elementPsets(api, mid, id);
      if (!isWall) {
        if (body?.kind !== "extrusion") no("a floor whose body is not an extrusion of a straight outline");
        const { outer, inners } = profileOf(body.profile);
        const top = Math.max(body.z0, body.z1);
        out.floors.push({
          global_id: gid, name, ifc_class: className(l, id), storey,
          loop: outer.map((p) => at(body.T, [p[0], p[1], 0]).slice(0, 2).map(r1)), top_mm: r1(top), thickness_mm: r1(Math.abs(body.z1 - body.z0)),
          is_external: external(g, "Pset_SlabCommon"), voids: inners.length,
        });
        if (inners.length) skip(id, l, storey, `${inners.length} hole(s) — not proposed`);
        continue;
      }

      // the line: the Axis, else the mid-line of the short edges of a rectangular body
      let line = axisOf(l, F), fromAxis = line != null, bodyT = null;
      if (!line) {
        if (body?.kind !== "extrusion") no("no Axis and no rectangular body");
        const { outer } = profileOf(body.profile), q = outer.map((p) => at(body.T, [p[0], p[1], 0]).slice(0, 2));
        const e = (i) => Math.hypot(q[(i + 1) % 4][0] - q[i][0], q[(i + 1) % 4][1] - q[i][1]);
        const sq = q.length === 4 && Math.hypot(q[0][0] + q[2][0] - q[1][0] - q[3][0], q[0][1] + q[2][1] - q[1][1] - q[3][1]) < 1
          && Math.abs((q[1][0] - q[0][0]) * (q[2][0] - q[1][0]) + (q[1][1] - q[0][1]) * (q[2][1] - q[1][1])) < 1e-3 * e(0) * e(1);
        if (!sq) no("no Axis and no rectangular body");
        line = e(0) >= e(1) ? [mid2(q[3], q[0]), mid2(q[1], q[2])] : [mid2(q[0], q[1]), mid2(q[2], q[3])];
        bodyT = Math.min(e(0), e(1));
      }
      // the thickness: the instance's layer-set usage, the type's layer set, BaseQuantities Width, the body's short edge
      let t = null, from = null, note, shift = 0;
      const own = L(materialOf.get(id)), typed = L(materialOf.get(typeOf.get(id)));
      if (own?.type === WebIFC.IFCMATERIALLAYERSETUSAGE && (t = layerSum(ref(own.ForLayerSet))) > 0) {
        if (String(val(own.LayerSetDirection)) !== "AXIS2") no("layers that do not run across the wall");
        from = "layers";
        shift = (num(own.OffsetFromReferenceLine) ?? 0) * mm + (String(val(own.DirectionSense)) === "POSITIVE" ? t / 2 : -t / 2);
      } else {
        const set = [own, typed].find((m) => m?.type === WebIFC.IFCMATERIALLAYERSET);
        if (set && (t = layerSum(set.expressID)) > 0) { from = "type_layers"; note = "centre not stated (no layer-set usage)"; }
        else if ((t = quantity(g, "Width")) != null) from = "base_quantities";
        else if (bodyT != null) { t = bodyT; from = "body"; }
        else no("no thickness: no material layers, no base quantity Width, no rectangular body");
      }
      if (fromAxis && shift) { const y = F.y; line = line.map((p) => [p[0] + shift * y[0], p[1] + shift * y[1]]); }
      // the height and base: the body's z range, else BaseQuantities Height
      let h, base, kind;
      if (body) { h = Math.abs(body.z1 - body.z0); base = Math.min(body.z0, body.z1); kind = body.kind; }
      else if ((h = quantity(g, "Height")) != null) { base = F.o[2]; kind = "quantities"; }
      else no("no height: no extrusion, no brep, no tessellated body, no base quantity Height");
      out.walls.push({
        global_id: gid, name, ifc_class: className(l, id), storey,
        start: line[0].map(r1), end: line[1].map(r1), base_mm: r1(base), height_mm: r1(h), thickness_mm: r1(t), thickness_from: from,
        is_external: external(g, "Pset_WallCommon"), clipped: !!body?.clipped, body: kind, ...(note ? { note } : {}),
      });
    } catch (e) {
      skip(id, l, storey, e instanceof NotRead ? e.message : `could not be read — ${clean(e?.message, 200)}`);
    }
  }

  // everything else that is an element: said, never silently dropped (openings and voids are features of another element)
  const featureIds = new Set(idsOf(api, mid, WebIFC.IFCFEATUREELEMENT));
  for (const id of idsOf(api, mid, WebIFC.IFCELEMENT)) {
    if (wallIds.has(id) || slabIds.has(id) || featureIds.has(id)) continue;
    const l = L(id);
    if (l) skip(id, l, storeyOf.get(id) ?? null, `an ${prose(l, id)} — the IFC planner reads walls and floors (MA-6); a person places it`);
  }

  // ── hint: where the file sits in the world, reported and not applied ────────────────────────────────────────────────────────
  try {
    const site = L(idsOf(api, mid, WebIFC.IFCSITE)[0]);
    if (site) { const F = placementOf(ref(site.ObjectPlacement)); out.hint.site = { at_mm: F.o.map(r1), rotation_deg: Math.round(Math.atan2(F.x[1], F.x[0]) * 18000 / Math.PI) / 100 }; }
  } catch { out.hint.site = null; }
  const mc = L(idsOf(api, mid, WebIFC.IFCMAPCONVERSION)[0]);
  if (mc) out.hint.map_conversion = { eastings: num(mc.Eastings) ?? 0, northings: num(mc.Northings) ?? 0, height: num(mc.OrthogonalHeight) ?? 0, x_axis_abscissa: num(mc.XAxisAbscissa) ?? 1, x_axis_ordinate: num(mc.XAxisOrdinate) ?? 0, scale: num(mc.Scale) ?? 1 };
  try {
    const ctx = idsOf(api, mid, WebIFC.IFCGEOMETRICREPRESENTATIONCONTEXT).map(L).find((c) => c && String(val(c.ContextType)) === "Model") ?? L(idsOf(api, mid, WebIFC.IFCGEOMETRICREPRESENTATIONCONTEXT)[0]);
    if (ctx?.WorldCoordinateSystem) {
      const F = frame3(ref(ctx.WorldCoordinateSystem));
      out.hint.context_wcs_not_origin = Math.hypot(...F.o) > 0.1 || Math.abs(F.x[0] - 1) > 1e-9 || Math.abs(F.z[2] - 1) > 1e-9;
    }
  } catch { /* an unreadable WCS is not a finding */ }
  return out;
}

// ── CLI (I-0): what the reader finds in a file, in words ────────────────────────────────────────────────────────────────────
function report(r) {
  const p = (...a) => console.log(...a);
  const xy = (a) => `(${a[0]}, ${a[1]})`;
  p(`${IFC} ${VERSION} · ${r.schema || "unknown schema"} · 1 unit = ${r.mm_per_unit} mm`);
  p(`levels (${r.levels.length}):`);
  for (const l of r.levels) p(`  ${l.cid} ${l.name} at ${l.elevation_mm} mm`);
  p(`walls (${r.walls.length}):`);
  for (const w of r.walls) p(`  ${w.global_id} · ${w.storey} · ${xy(w.start)} → ${xy(w.end)} · ${w.thickness_mm} mm (${w.thickness_from}) · h ${w.height_mm} from ${w.base_mm} · external ${w.is_external} · clipped ${w.clipped} · ${w.body}${w.note ? ` · ${w.note}` : ""}`);
  p(`floors (${r.floors.length}):`);
  for (const f of r.floors) {
    let a = 0;
    f.loop.forEach((q, i) => { const n = f.loop[(i + 1) % f.loop.length]; a += q[0] * n[1] - n[0] * q[1]; });
    p(`  ${f.global_id} · ${f.storey} · ${f.loop.length} corners ${f.loop.map(xy).join(" ")} · ${(Math.abs(a) / 2e6).toFixed(1)} m² · top ${f.top_mm} · ${f.thickness_mm} mm`);
  }
  p(`not read (${r.not_read.length}):`);
  for (const n of r.not_read) p(`  ${n.global_id} ${n.ifc_class} ${n.storey ?? "-"} · ${n.why}`);
  p(`hint: ${JSON.stringify(r.hint)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2]) throw new Error("usage: node bridge/ifc-geometry.mjs <file.ifc>");
    report(await readIfcGeometry(readFileSync(process.argv[2])));
  } catch (e) {
    console.error(String(e?.message ?? e));
    process.exit(1);
  }
}
