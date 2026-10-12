// MA-6-7 — the IFC geometry reader: an IFC's levels, straight walls and floors as the numbers a changeset needs (centre line,
// thickness, height, outline), read with web-ifc in process, pure over the file's bytes. Lengths are millimetres in the IFC's own
// frame (the composed placement chain); a context WCS or site that is not the origin is reported in `hint`, not applied. What it
// does not read it lists in `not_read`, each with its words; one bad entity is listed, never thrown. MA-8-4 (0.2.0): also the wall and floor
// openings, the doors and windows that fill them, columns and curtain walls, and a body that is a mapped item (Revit's); stairs are boxed, not
// read (8-9 flags them). The file is untrusted: the
// placement chain and the clipping unwrap stop at depth 64, and every name that leaves is one clean line.
// CLI: node bridge/ifc-geometry.mjs <file.ifc>
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import * as WebIFC from "web-ifc";
import { lengthUnit, val, num, ref, idsOf } from "./ifc-manifest.mjs";
import { elementPsets } from "./ifc-extract.mjs";
import { sizeRefusal } from "./evidence-logic.mjs";

export const IFC = "sentinel-ifc";
export const VERSION = "0.2.0";

const WASM_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../node_modules/web-ifc") + "/";
const MAX_DEPTH = 64;
const MAX_PTS = 10_000;   // MA-8-4: a body's points (an untrusted file's guard), and the holes one floor files

class NotRead extends Error {}
const no = (why) => { throw new NotRead(why); };
const clean = (s, n = 256) => String(s ?? "").replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").trim().slice(0, n);
const r1 = (x) => Math.round(x * 10) / 10;
const area2 = (pts) => Math.abs(pts.reduce((s, q, i) => s + q[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * q[1], 0)) / 2;

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

/** `wallsOnly` (MA-8-4, amendment 17): the levels, walls and floors alone — a manifest capture on every Governed Publish needs no more. */
export async function readIfcGeometry(bytes, { wallsOnly = false } = {}) {
  const api = new WebIFC.IfcAPI();
  api.SetWasmPath(WASM_DIR, true);
  await api.Init();
  let mid;
  try { mid = api.OpenModel(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); } catch (e) { throw new Error(`web-ifc could not open the file: ${clean(e?.message, 200)}`); }
  if (mid == null || mid < 0) throw new Error("web-ifc could not open the file: it is not a readable IFC (STEP) model");
  try {
    return await read(api, mid, wallsOnly);
  } finally {
    api.CloseModel(mid);
  }
}

async function read(api, mid, wallsOnly = false) {
  const { mm, how: unitHow } = lengthUnit(api, mid);
  const cache = new Map();
  const L = (id) => { if (id == null) return null; if (!cache.has(id)) { try { cache.set(id, api.GetLine(mid, id)); } catch { cache.set(id, null); } } return cache.get(id); };
  const R = (o) => L(ref(o));
  const refs = (list) => (Array.isArray(list) ? list.map(R).filter(Boolean) : []);
  const className = (l, id) => String(api.GetNameFromTypeCode(l?.type) || `#${id}`).toUpperCase();
  const prose = (l, id) => l?.constructor?.name && l.constructor.name !== "Object" ? l.constructor.name : `Ifc${className(l, id).replace(/^IFC/, "").toLowerCase()}`;

  const point = (o) => { const p = R(o); return pad3((p?.Coordinates || []).map((c) => (num(c) ?? 0) * mm)); };
  // a GlobalId that leaves the reader is a real IFC GlobalId (22 of 0-9A-Za-z_$) or the entity number: the file is untrusted
  const gidOf = (l, id) => { const g = String(val(l?.GlobalId) ?? ""); return /^[0-9A-Za-z_$]{22}$/.test(g) ? g : `#${id}`; };
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
  const out = { reader: IFC, version: VERSION, schema: "", mm_per_unit: mm, levels: [], walls: [], floors: [], openings: [], doors: [], windows: [], columns: [], curtain_walls: [], not_read: [],
    hint: { site: null, map_conversion: null, storey_elevation_mismatch: [], context_wcs_not_origin: false, true_north: null, length_unit_assumed: unitHow === "default" } };
  try { out.schema = String(api.GetModelSchema(mid) || "").toUpperCase(); } catch { out.schema = ""; }

  const storeys = [];
  for (const id of idsOf(api, mid, WebIFC.IFCBUILDINGSTOREY)) {
    const s = L(id);
    if (!s) continue;
    const attr = num(s.Elevation), elev = attr == null ? null : attr * mm;
    let placed = null;
    try { placed = placementOf(ref(s.ObjectPlacement)).o[2]; } catch { placed = null; }
    storeys.push({ id, global_id: gidOf(s, id), name: clean(val(s.Name) ?? `#${id}`), z: placed ?? elev ?? 0, attr: elev, placed });
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
  const dedupe = (pts) => pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) >= 1);   // consecutive points under 1 mm apart are one
  const dropClosing = (pts) => (pts.length > 1 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 1 ? pts.slice(0, -1) : pts);
  // An IfcIndexedPolyCurve's points, in order (2 or 3 numbers each). Segments absent = one polyline through the list; the raw line keeps each
  // segment's type code (the parsed one does not): an IfcArcIndex is a curve, an IfcLineIndex of any length is straight (MA-6-8: F-B3-1, Revit's Axis).
  const indexedPts = (c, curve, curved = "a curved outline — straight edges only") => {
    const all = (R(c.Points)?.CoordList || []).map((p) => p.map((n) => (num(n) ?? 0) * mm));
    if (!(Array.isArray(c.Segments) && c.Segments.length)) return all;
    const raw = api.GetRawLineData(mid, ref(curve)).arguments?.[1];
    const pts = [];
    c.Segments.forEach((s, k) => {
      if (raw?.[k]?.typecode === WebIFC.IFCARCINDEX) no(curved);
      const seg = (Array.isArray(s?.value) ? s.value : []).map((n) => all[Number(n?.value ?? n) - 1]).filter(Boolean);
      for (const q of seg) if (!pts.length || Math.hypot(q[0] - pts.at(-1)[0], q[1] - pts.at(-1)[1]) > 1e-6) pts.push(q);
    });
    return pts;
  };
  const loopOf = (curve) => {   // a closed outline of straight edges, 2D, the closing point dropped
    const c = R(curve);
    let pts;
    if (c?.type === WebIFC.IFCPOLYLINE) pts = (c.Points || []).map((p) => point(p).slice(0, 2));
    else if (c?.type === WebIFC.IFCINDEXEDPOLYCURVE) pts = indexedPts(c, curve).map((q) => q.slice(0, 2));
    else no("a curved outline — straight edges only");
    pts = dropClosing(dedupe(pts));
    if (pts.length < 3) no("an outline with fewer than 3 corners");
    if (area2(pts) < 1) no("an outline with no area");
    return pts;
  };
  const profileOf = (id) => {   // → { outer: [[x,y]…] in the solid's plane, inners }
    const p = L(id);
    if (p?.type === WebIFC.IFCRECTANGLEPROFILEDEF) {
      const hx = (num(p.XDim) ?? 0) * mm / 2, hy = (num(p.YDim) ?? 0) * mm / 2, F2 = frame2(p.Position);
      if (!(hx > 0 && hy > 0)) no("a rectangle with no size");
      return { outer: [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map((q) => at(F2, [q[0], q[1], 0]).slice(0, 2)), inners: [] };
    }
    // MA-8-4: each hole is parsed ({loop} or {why}), never thrown: a round shaft must not cost the floor
    if (p?.type === WebIFC.IFCARBITRARYPROFILEDEFWITHVOIDS) return { outer: loopOf(p.OuterCurve), inners: (p.InnerCurves || []).map((c) => { try { return { loop: loopOf(c) }; } catch (e) { if (e instanceof NotRead) return { why: e.message }; throw e; } }) };
    if (p?.type === WebIFC.IFCARBITRARYCLOSEDPROFILEDEF) return { outer: loopOf(p.OuterCurve), inners: [] };
    return no("a profile it does not read");
  };
  // The first representation that holds a solid we read: an extrusion (through any clipping), a faceted brep or a tessellation.
  // `solids` is how many such items it holds; `why` (set on the line's way) says what was passed over (a tilted, sideways or flat body).
  // MA-8-4: an IfcMappedItem (Revit writes a column's and a door's body so) → its source's items and the frame they stand in. The mapping
  // origin must be the identity and the target's scale 1; a mapped item inside a mapped item is not followed (the untrusted-file guard).
  const mapOf = (it, F, nested) => {
    if (nested) no("a mapped body nested twice");
    const src = R(it.MappingSource), tgt = R(it.MappingTarget);
    if (!src || !tgt) no("a mapped body that cannot be read");
    const o = frame3(ref(src.MappingOrigin));
    if (Math.hypot(...o.o) > 0.01 || Math.abs(o.x[0] - 1) > 1e-6 || Math.abs(o.z[2] - 1) > 1e-6) no("a mapped body with a moved origin");
    if ([tgt.Scale, tgt.Scale2, tgt.Scale3].some((s) => s != null && Math.abs((num(s) ?? 1) - 1) > 1e-9)) no("a scaled mapped body");
    const z = unit(tgt.Axis3 ? dirOf(tgt.Axis3) : [0, 0, 1]), xr = tgt.Axis1 ? dirOf(tgt.Axis1) : [1, 0, 0];
    const x = z && unit([0, 1, 2].map((i) => xr[i] - dot(xr, z) * z[i]));
    if (!z || !x) no("a mapped body with no usable axes");
    return { items: refs(R(src.MappedRepresentation)?.Items), F: compose(F, { o: point(tgt.LocalOrigin), x, y: cross(z, x), z }) };
  };
  const expand = (items, F, passed) => {
    const list = [];
    for (const it of items) {
      if (it.type !== WebIFC.IFCMAPPEDITEM) { list.push({ it, F }); continue; }
      try { const m = mapOf(it, F, false); for (const j of m.items) { if (j.type === WebIFC.IFCMAPPEDITEM) passed.why = "a mapped body nested twice"; else list.push({ it: j, F: m.F }); } }
      catch (e) { if (!(e instanceof NotRead)) throw e; passed.why = e.message; }
    }
    return list;
  };
  const bodyOf = (line, F0, passed) => {
    const pds = R(line.Representation);
    const reps = refs(pds?.Representations);
    const idf = (r) => String(val(r.RepresentationIdentifier) ?? "");
    for (const rep of [...reps.filter((r) => idf(r) === "Body"), ...reps.filter((r) => idf(r) !== "Body" && idf(r) !== "Axis")]) {
      const found = [];
      for (const { it: item, F } of expand(refs(rep.Items), F0, passed)) {
        let it = item, clipped = false, d = 0;
        while (it && (it.type === WebIFC.IFCBOOLEANCLIPPINGRESULT || it.type === WebIFC.IFCBOOLEANRESULT)) {
          if (++d > MAX_DEPTH) no("clipping nested too deep");
          clipped = true;
          it = R(it.FirstOperand);
        }
        if (!it) continue;
        if (it.type === WebIFC.IFCEXTRUDEDAREASOLID) {
          const T = compose(F, it.Position ? frame3(ref(it.Position)) : IDENT);
          if (!upright(T)) { passed.why = "a body placed tilted"; continue; }
          const depth = (num(it.Depth) ?? 0) * mm;
          const dz = rot(T, unit(dirOf(it.ExtrudedDirection)) ?? [0, 0, 1])[2];
          if (!(depth > 0)) continue;
          if (Math.abs(dz) < 0.9999) { passed.why = "a body extruded off vertical"; continue; }
          found.push({ kind: "extrusion", clipped, T, profile: ref(it.SweptArea), depth, z0: T.o[2], z1: T.o[2] + depth * dz });
          continue;
        }
        const zs = [], xy = [];
        const take = (w) => { zs.push(w[2]); xy.push(w.slice(0, 2)); };
        if (it.type === WebIFC.IFCFACETEDBREP) {
          for (const f of refs(R(it.Outer)?.CfsFaces)) for (const b of refs(f.Bounds)) { const lp = R(b.Bound); if (lp?.type === WebIFC.IFCPOLYLOOP) for (const p of lp.Polygon || []) take(at(F, point(p))); }
        } else if (it.type === WebIFC.IFCTRIANGULATEDFACESET || it.type === WebIFC.IFCPOLYGONALFACESET) {
          for (const p of R(it.Coordinates)?.CoordList || []) take(at(F, p.map((c) => (num(c) ?? 0) * mm)));
        } else continue;
        if (!zs.length) continue;
        const z0 = Math.min(...zs), z1 = Math.max(...zs);
        if (!(z1 - z0 > 1)) { passed.why = "a flat body"; continue; }
        found.push({ kind: it.type === WebIFC.IFCFACETEDBREP ? "brep" : "tessellated", clipped, z0, z1, xy });
      }
      if (found.length) return { ...found[0], solids: found.length };
    }
    return null;
  };
  // MA-8-4: a body's 3D world points at any angle (bodyOf drops Revit's horizontal opening extrusions): an extrusion's profile corners at both
  // ends (a circle as a 16-gon), a B-rep's or face set's vertices; a mapped item once. null when the line has none; over MAX_PTS is not read.
  const profilePts = (id) => {
    const p = L(id);
    if (p?.type !== WebIFC.IFCCIRCLEPROFILEDEF) return profileOf(id).outer;
    const r = (num(p.Radius) ?? 0) * mm, F2 = frame2(p.Position);
    if (!(r > 0)) no("a circle with no radius");
    return Array.from({ length: 16 }, (_, k) => at(F2, [r * Math.cos(k * Math.PI / 8), r * Math.sin(k * Math.PI / 8), 0]).slice(0, 2));
  };
  const bodyPoints = (line, F) => {
    const reps = refs(R(line.Representation)?.Representations);
    const idf = (r) => String(val(r.RepresentationIdentifier) ?? "");
    const pts = [], groups = [];   // groups: the points of each solid on its own (wallBox: two solids side by side are not one rectangle)
    const add = (p) => { pts.push(p); groups.at(-1).push(p); if (pts.length > MAX_PTS) no(`a body of more than ${MAX_PTS} points`); };
    const walk = (it0, G, nested) => {
      let it = it0, d = 0;
      while (it && (it.type === WebIFC.IFCBOOLEANCLIPPINGRESULT || it.type === WebIFC.IFCBOOLEANRESULT)) { if (++d > MAX_DEPTH) no("clipping nested too deep"); it = R(it.FirstOperand); }
      if (!it) return;
      if (it.type === WebIFC.IFCMAPPEDITEM) { const m = mapOf(it, G, nested); for (const j of m.items) walk(j, m.F, true); return; }
      if (it.type === WebIFC.IFCEXTRUDEDAREASOLID || it.type === WebIFC.IFCFACETEDBREP || it.type === WebIFC.IFCTRIANGULATEDFACESET || it.type === WebIFC.IFCPOLYGONALFACESET) groups.push([]);
      if (it.type === WebIFC.IFCEXTRUDEDAREASOLID) {
        const T = compose(G, it.Position ? frame3(ref(it.Position)) : IDENT), depth = (num(it.Depth) ?? 0) * mm, dir = unit(dirOf(it.ExtrudedDirection)) ?? [0, 0, 1];
        if (!(depth > 0)) return;
        for (const p of profilePts(ref(it.SweptArea))) { add(at(T, [p[0], p[1], 0])); add(at(T, [p[0] + depth * dir[0], p[1] + depth * dir[1], depth * dir[2]])); }
      } else if (it.type === WebIFC.IFCFACETEDBREP) {
        for (const f of refs(R(it.Outer)?.CfsFaces)) for (const b of refs(f.Bounds)) { const lp = R(b.Bound); if (lp?.type === WebIFC.IFCPOLYLOOP) for (const p of lp.Polygon || []) add(at(G, point(p))); }
      } else if (it.type === WebIFC.IFCTRIANGULATEDFACESET || it.type === WebIFC.IFCPOLYGONALFACESET) {
        for (const p of R(it.Coordinates)?.CoordList || []) add(at(G, p.map((c) => (num(c) ?? 0) * mm)));
      }
    };
    for (const rep of [...reps.filter((r) => idf(r) === "Body"), ...reps.filter((r) => idf(r) !== "Body" && idf(r) !== "Axis")]) {
      for (const it of refs(rep.Items)) walk(it, F, false);
      if (pts.length) return Object.assign(pts, { groups });
    }
    return null;
  };
  const e4 = (q, i) => Math.hypot(q[(i + 1) % 4][0] - q[i][0], q[(i + 1) % 4][1] - q[i][1]);
  // four corners in order: opposite corners share a middle, and the first two edges meet at a right angle
  const rect4 = (q) => q.length === 4 && Math.hypot(q[0][0] + q[2][0] - q[1][0] - q[3][0], q[0][1] + q[2][1] - q[1][1] - q[3][1]) < 1
    && Math.abs((q[1][0] - q[0][0]) * (q[2][0] - q[1][0]) + (q[1][1] - q[0][1]) * (q[2][1] - q[1][1])) < 1e-3 * e4(q, 0) * e4(q, 1);
  // MA-6-8: a straight wall's body (any number of points) as a band along the unit direction u: every point lies on one of two parallel lines.
  // → { s0, s1 (along u), d0, d1 (across, left of u) } | null. Revit's Reference View profiles are joined at corners and may have 6 points.
  const bandOf = (q, u) => {
    const n = [-u[1], u[0]], d = q.map((p) => p[0] * n[0] + p[1] * n[1]), sv = q.map((p) => p[0] * u[0] + p[1] * u[1]);
    const d0 = Math.min(...d), d1 = Math.max(...d);
    if (!d.every((x) => x - d0 < 1 || d1 - x < 1)) return null;
    // a mitred or joined end makes the two faces unequal: the mid-line runs between the averages of each face's own ends
    const ext = (on) => { const v = sv.filter((_, i) => on(d[i])); return [Math.min(...v), Math.max(...v)]; };
    const [a0, a1] = ext((x) => x - d0 < 1), [b0, b1] = ext((x) => d1 - x < 1);
    return { s0: (a0 + b0) / 2, s1: (a1 + b1) / 2, d0, d1 };
  };
  const bodyXY = (body) => {
    if (body?.xy) return body.xy;
    try { return profileOf(body.profile).outer.map((p) => at(body.T, [p[0], p[1], 0]).slice(0, 2)); } catch { return null; }
  };
  const axisOf = (line, F) => {   // the wall's Axis in world xy → [start, end] | null when it has none
    const rep = refs(R(line.Representation)?.Representations).find((r) => String(val(r.RepresentationIdentifier) ?? "") === "Axis");
    const c = rep && refs(rep.Items)[0];
    if (!c) return null;
    let a, b;
    if (c.type === WebIFC.IFCINDEXEDPOLYCURVE) {   // Revit's IFC4 axis: a 2-point list, no Segments. Several points are one wall only when they lie on one line.
      const q = indexedPts(c, ref(rep.Items[0]), "a curved wall — straight walls only").map(pad3);
      [a, b] = [q[0], q.at(-1)];
      if (q.length > 2 && a && b) {
        const u = unit([b[0] - a[0], b[1] - a[1], 0]);
        if (!u || q.some((p) => Math.abs((p[0] - a[0]) * u[1] - (p[1] - a[1]) * u[0]) > 1)) no("a wall with a bent axis — straight walls only");
      }
    } else if (c.type === WebIFC.IFCPOLYLINE) {
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
    const ends = [at(F, a).slice(0, 2), at(F, b).slice(0, 2)];
    if (Math.hypot(ends[0][0] - ends[1][0], ends[0][1] - ends[1][1]) < 10) no("a wall whose axis has no length");   // Revit's shortest curve is under 1 mm
    return ends;
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
  const skip = (id, l, storey, why, extra = {}) => { reported.add(id); out.not_read.push({ global_id: gidOf(l, id), ifc_class: className(l, id), ifc_name: prose(l, id), storey, why: clean(why, 500), ...extra }); };

  const openingsOf = new Map(), voidHost = new Map(), fillerOf = new Map(), openingOf = new Map();   // host id → its opening ids; opening → host; opening → its filler; filler → its opening
  for (const id of idsOf(api, mid, WebIFC.IFCRELVOIDSELEMENT)) { const r = L(id); if (r) { const h = ref(r.RelatingBuildingElement), o = ref(r.RelatedOpeningElement); openingsOf.set(h, [...(openingsOf.get(h) ?? []), o]); voidHost.set(o, h); } }
  for (const id of idsOf(api, mid, WebIFC.IFCRELFILLSELEMENT)) { const r = L(id); if (r) { fillerOf.set(ref(r.RelatingOpeningElement), ref(r.RelatedBuildingElement)); openingOf.set(ref(r.RelatedBuildingElement), ref(r.RelatingOpeningElement)); } }
  const wallIds = new Set(idsOf(api, mid, WebIFC.IFCWALL));
  const slabIds = new Set(idsOf(api, mid, WebIFC.IFCSLAB));
  // MA-8-4: what pairs a door or window with its opening, what an element is part of, and which elements are said already (not_read says each once)
  const tagOf = (l) => clean(val(l?.Tag), 64);
  const isRevit = idsOf(api, mid, WebIFC.IFCAPPLICATION).some((id) => /revit/i.test(`${val(L(id)?.ApplicationFullName) ?? ""} ${val(L(id)?.ApplicationIdentifier) ?? ""}`));
  const doorIds = new Set(idsOf(api, mid, WebIFC.IFCDOOR)), windowIds = new Set(idsOf(api, mid, WebIFC.IFCWINDOW));
  const curtainIds = new Set(idsOf(api, mid, WebIFC.IFCCURTAINWALL)), stairIds = new Set(idsOf(api, mid, WebIFC.IFCSTAIR));
  const partsOf = new Map(), partOf = new Map();   // parent id → part ids; part id → its curtain wall or stair
  for (const id of idsOf(api, mid, WebIFC.IFCRELAGGREGATES)) {
    const r = L(id), p = ref(r?.RelatingObject);
    if (!r || p == null) continue;
    const parts = (r.RelatedObjects || []).map(ref).filter((x) => x != null);
    partsOf.set(p, [...(partsOf.get(p) ?? []), ...parts]);
    if (curtainIds.has(p) || stairIds.has(p)) for (const x of parts) partOf.set(x, p);
  }
  const tagged = new Map();   // Tag → unfilled opening ids; Revit writes a door's or window's void without the fills relation, under the element's own Tag
  for (const id of idsOf(api, mid, WebIFC.IFCOPENINGELEMENT)) { const t = tagOf(L(id)); if (t && !fillerOf.has(id)) tagged.set(t, [...(tagged.get(t) ?? []), id]); }
  const claimed = new Set(), doorOpening = new Map();   // openings a door or window owns; door/window id → its opening id
  for (const [f, o] of openingOf) if (doorIds.has(f) || windowIds.has(f)) { doorOpening.set(f, o); claimed.add(o); }
  if (isRevit) for (const f of [...doorIds, ...windowIds]) {
    if (doorOpening.has(f)) continue;
    const o = (tagged.get(tagOf(L(f))) ?? []).find((x) => !claimed.has(x));
    if (o != null && tagOf(L(f))) { doorOpening.set(f, o); claimed.add(o); }
  }
  const flightIds = new Set(idsOf(api, mid, WebIFC.IFCSTAIRFLIGHT));
  const partWhy = (id) => {   // the words of a piece of a curtain wall or a stair — the whole is the element, never its pieces
    const p = partOf.get(id), g = gidOf(L(p), p);
    return stairIds.has(p) ? (flightIds.has(id) ? `a flight of stair ${g}` : `a part of stair ${g}`) : `a panel or mullion of curtain wall ${g} — its curtain type draws them`;
  };
  const reported = new Set(), hostRec = new Map();   // element ids with a record or a not_read row; read wall/floor id → {kind, rec, holes?}
  for (const id of [...wallIds, ...slabIds]) {
    const l = L(id);
    if (!l) continue;
    reported.add(id);
    const storey = storeyOf.get(id) ?? null;
    try {
      const gid = gidOf(l, id);
      if (seen.has(gid)) no("GlobalId repeated");
      seen.add(gid);
      if (partOf.has(id)) no(partWhy(id));
      const name = clean(val(l.Name) ?? gid), isWall = wallIds.has(id);
      if (!isWall && String(val(l.PredefinedType)) === "ROOF") no("a roof slab — roofs are not proposed");
      if (storey == null) no("not on a storey");
      const F = placedUpright(l.ObjectPlacement);
      const passed = { why: null };
      const body = bodyOf(l, F, passed);
      if (body?.solids > 1) no(`a body of ${body.solids} solids — one outline only`);
      const g = await elementPsets(api, mid, id);
      if (!isWall) {
        if (body?.kind !== "extrusion") no(passed.why ? `a floor whose body is ${passed.why.replace(/^a body /, "")}` : "a floor whose body is not an extrusion of a straight outline");
        const { outer, inners } = profileOf(body.profile);
        const top = Math.max(body.z0, body.z1), thick = Math.abs(body.z1 - body.z0);
        if (!(thick > 1)) no("a floor with no thickness");
        const opens = openingsOf.get(id)?.length ?? 0;
        out.floors.push({
          global_id: gid, name, ifc_class: className(l, id), storey,
          loop: outer.map((p) => at(body.T, [p[0], p[1], 0]).slice(0, 2).map(r1)), top_mm: r1(top), thickness_mm: r1(thick),
          is_external: external(g, "Pset_SlabCommon"), voids: inners.length + opens,
        });
        // MA-8-4: the holes are read below (profile voids here, the openings of the voids relation), not counted away
        hostRec.set(id, { kind: "floor", rec: out.floors.at(-1), holes: inners.map((h) => (h.loop ? { loop: h.loop.map((p) => at(body.T, [p[0], p[1], 0]).slice(0, 2).map(r1)) } : h)) });
        continue;
      }

      // the line: the Axis, else the mid-line of the short edges of a rectangular body
      let line = axisOf(l, F), fromAxis = line != null, rect = null;
      if (!line) {
        if (body?.kind !== "extrusion") no("no Axis and no rectangular body");
        const { outer } = profileOf(body.profile), q = outer.map((p) => at(body.T, [p[0], p[1], 0]).slice(0, 2));
        const e = (i) => Math.hypot(q[(i + 1) % 4][0] - q[i][0], q[(i + 1) % 4][1] - q[i][1]);
        const sq = rect4(q);
        if (!sq) {   // not a 4-point rectangle: the band of its longest edge, if every point sits on one of two parallel lines
          let k = 0;
          for (let i = 1; i < q.length; i++) if (Math.hypot(q[(i + 1) % q.length][0] - q[i][0], q[(i + 1) % q.length][1] - q[i][1]) > Math.hypot(q[(k + 1) % q.length][0] - q[k][0], q[(k + 1) % q.length][1] - q[k][1])) k = i;
          const u = unit([q[(k + 1) % q.length][0] - q[k][0], q[(k + 1) % q.length][1] - q[k][1], 0]), b = u && bandOf(q, u);
          if (!b) no("no Axis and no rectangular body");
          const n = [-u[1], u[0]], dm = (b.d0 + b.d1) / 2, pt = (s) => [u[0] * s + n[0] * dm, u[1] * s + n[1] * dm];
          rect = [{ line: [pt(b.s0), pt(b.s1)], t: b.d1 - b.d0 }];
          line = rect[0].line;
        } else {
        rect = [{ line: [mid2(q[3], q[0]), mid2(q[1], q[2])], t: e(1) }, { line: [mid2(q[0], q[1]), mid2(q[2], q[3])], t: e(0) }];   // along either edge pair
        line = rect[e(0) >= e(1) ? 0 : 1].line;
        }
      }
      // the thickness: the instance's layer-set usage, the type's layer set, BaseQuantities Width, the body's short edge
      let t = null, from = null, note, shift = 0;
      const bodyThickness = (ln) => {   // the body's width across the axis; the line moves to the middle of the body
        const q = bodyXY(body), u = unit([ln[1][0] - ln[0][0], ln[1][1] - ln[0][1], 0]), b = q && u && bandOf(q, u);
        if (!b) return null;
        const n = [-u[1], u[0]], off = (b.d0 + b.d1) / 2 - (ln[0][0] * n[0] + ln[0][1] * n[1]);
        line = ln.map((p) => [p[0] + off * n[0], p[1] + off * n[1]]);
        return b.d1 - b.d0;
      };
      const own = L(materialOf.get(id)), typed = L(materialOf.get(typeOf.get(id)));
      if (own?.type === WebIFC.IFCMATERIALLAYERSETUSAGE && (t = layerSum(ref(own.ForLayerSet))) > 0) {
        if (String(val(own.LayerSetDirection)) !== "AXIS2") no("layers that do not run across the wall");
        from = "layers";
        shift = (num(own.OffsetFromReferenceLine) ?? 0) * mm + (String(val(own.DirectionSense)) === "POSITIVE" ? t / 2 : -t / 2);
      } else {
        const set = [own, typed].map((m) => (m?.type === WebIFC.IFCMATERIALLAYERSETUSAGE ? L(ref(m.ForLayerSet)) : m)).find((m) => m?.type === WebIFC.IFCMATERIALLAYERSET);
        if (set && (t = layerSum(set.expressID)) > 0) { from = "type_layers"; note = "centre not stated (no layer-set usage)"; }
        else if ((t = quantity(g, "Width")) != null) from = "base_quantities";
        else if (rect) { t = Math.min(...rect.map((c) => c.t)); from = "body"; }
        else if (body && (t = bodyThickness(line)) > 0) from = "body";   // an Axis and no stated thickness (Revit IFC4 RV): the body's width across it
        else no("no thickness: no material layers, no base quantity Width, no rectangular body");
      }
      // a body-only wall whose thickness came from layers or quantities runs along the edge pair that thickness fits
      if (from === "type_layers" && fromAxis && body && bodyThickness(line) > 0) note = undefined;   // MA-6-8 review: the Axis may sit on a face — the line is centred on the body band
      if (rect && from !== "body") line = rect.reduce((m, c) => (Math.abs(c.t - t) < Math.abs(m.t - t) ? c : m)).line;
      if (fromAxis && shift) { const y = F.y; line = line.map((p) => [p[0] + shift * y[0], p[1] + shift * y[1]]); }
      // the height and base: the body's z range, else BaseQuantities Height
      let h, base, kind;
      if (body) { h = Math.abs(body.z1 - body.z0); base = Math.min(body.z0, body.z1); kind = body.kind; }
      else if ((h = quantity(g, "Height")) != null) { base = F.o[2]; kind = "quantities"; }
      else no("no height: no extrusion, no brep, no tessellated body, no base quantity Height");
      if (!(h > 1)) no("no height");
      if (!(t > 0)) no("no thickness");
      if (passed.why && !body) note = [note, `body not read — ${passed.why}`].filter(Boolean).join("; ");
      out.walls.push({
        global_id: gid, name, ifc_class: className(l, id), type_name: clean(val(L(typeOf.get(id))?.Name) ?? ""), storey,
        start: line[0].map(r1), end: line[1].map(r1), base_mm: r1(base), height_mm: r1(h), thickness_mm: r1(t), thickness_from: from,
        is_external: external(g, "Pset_WallCommon"), clipped: !!body?.clipped, body: kind, ...(note ? { note } : {}),
      });
      hostRec.set(id, { kind: "wall", rec: out.walls.at(-1) });
    } catch (e) {
      skip(id, l, storey, e instanceof NotRead ? e.message : `could not be read — ${clean(e?.message, 200)}`);
    }
  }

  // ── MA-8-4: openings, then the doors and windows that fill them, columns, curtain walls and stairs ───────────────────────────
  if (!wallsOnly) {
  const NOT_RECT = "an opening that is not a rectangle in its wall — a person cuts it";
  const NOT_SECTION = "a column whose section is not a rectangle or a circle — a person places it";
  const CURVED_HOLE = "a curved hole — the floor is proposed whole; a person cuts it";
  const HOLES = 200;
  const hurt = (e) => (e instanceof NotRead ? e.message : `could not be read — ${clean(e?.message, 200)}`);
  const boxes = new Map();
  // an opening's rectangle against its host wall's line: its points projected to (along, z)
  const wallBox = (oid, w) => {
    if (boxes.has(oid)) return boxes.get(oid);
    const o = L(oid);
    if (!o?.Representation) no("an opening with no body");
    const pts = bodyPoints(o, placementOf(ref(o.ObjectPlacement)));
    const u = unit([w.end[0] - w.start[0], w.end[1] - w.start[1], 0]);
    if (!pts || !u) no("an opening with no body");
    const q = pts.map((p) => [(p[0] - w.start[0]) * u[0] + (p[1] - w.start[1]) * u[1], p[2]]);
    const across = pts.map((p) => (p[0] - w.start[0]) * -u[1] + (p[1] - w.start[1]) * u[0]);   // its middle lies across the wall's own thickness, or it is another wall's
    if (Math.abs((Math.min(...across) + Math.max(...across)) / 2) > Math.max(w.thickness_mm, 100)) no("an opening that is not in its wall — a person cuts it");
    const a0 = Math.min(...q.map((p) => p[0])), a1 = Math.max(...q.map((p) => p[0])), z0 = Math.min(...q.map((p) => p[1])), z1 = Math.max(...q.map((p) => p[1]));
    // all four corners of the points' box are there (a notched, sloped or arched shape lacks one)
    const near = (c) => (p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 1;
    const corners = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
    if (!(a1 - a0 > 1 && z1 - z0 > 1) || !corners(a0, a1, z0, z1).every((c) => q.some(near(c)))) no(NOT_RECT);
    // a point off the outer box's edges is a corner of ONE nested box with all four corners (a window's reveal); two solids side by side, a notch
    // or a pocket leave points that are not (the cut would be the whole box). A point on an edge is one more along it.
    const onEdge = (p) => (Math.abs(p[0] - a0) < 1 || Math.abs(p[0] - a1) < 1 || Math.abs(p[1] - z0) < 1 || Math.abs(p[1] - z1) < 1);
    const rest = q.filter((p) => !onEdge(p));
    if (rest.length) {
      const b0 = Math.min(...rest.map((p) => p[0])), b1 = Math.max(...rest.map((p) => p[0])), y0 = Math.min(...rest.map((p) => p[1])), y1 = Math.max(...rest.map((p) => p[1]));
      const inner = corners(b0, b1, y0, y1);
      if (!(b1 - b0 > 1 && y1 - y0 > 1) || !inner.every((c) => rest.some(near(c))) || !rest.every((p) => inner.some((c) => near(c)(p)))) no(NOT_RECT);
    }
    // more than one solid: one holds the others (a reveal inside the void), or the cut is not one rectangle
    const gb = (pts.groups ?? []).map((g) => { const xs = g.map((p) => (p[0] - w.start[0]) * u[0] + (p[1] - w.start[1]) * u[1]), zs = g.map((p) => p[2]); return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]; });
    if (gb.length > 1 && !gb.some((o) => gb.every((i) => i[0] >= o[0] - 1 && i[1] <= o[1] + 1 && i[2] >= o[2] - 1 && i[3] <= o[3] + 1))) no(NOT_RECT);
    const elev = out.levels.find((l) => l.cid === w.storey)?.elevation_mm ?? 0;
    const b = { along_mm: r1((a0 + a1) / 2), width_mm: r1(a1 - a0), height_mm: r1(z1 - z0), sill_mm: r1(z0 - elev) };
    boxes.set(oid, b);
    return b;
  };
  const curtainTags = new Set([...curtainIds].map((c) => tagOf(L(c))).filter(Boolean));
  const byTag = new Map(), openingIds = new Set(idsOf(api, mid, WebIFC.IFCOPENINGELEMENT));   // Tag → the non-opening elements that carry it
  for (const id of idsOf(api, mid, WebIFC.IFCELEMENT)) { const t = openingIds.has(id) ? "" : tagOf(L(id)); if (t) byTag.set(t, [...(byTag.get(t) ?? []), id]); }
  for (const [hid, h] of hostRec) {
    const hl = L(hid), storey = h.rec.storey, hg = h.rec.global_id;
    if (h.kind === "floor") {
      // the holes: a profile's voids (no entity of their own), then the openings of the voids relation; the rest of a floor of hundreds is said
      const items = [...h.holes.map((x, k) => ({ gx: `${hg}:hole${k}`, hole: x })), ...(openingsOf.get(hid) ?? []).filter((o) => !claimed.has(o)).map((oid) => ({ oid }))];
      items.forEach((it, n) => {
        if (it.oid != null) reported.add(it.oid);
        const o = it.oid != null ? L(it.oid) : null;
        if (it.oid != null && !o) return;
        const gx = it.gx ?? gidOf(o, it.oid);
        const said = (why) => (o ? skip(it.oid, o, storey, why) : out.not_read.push({ global_id: gx, ifc_class: "IFCOPENINGELEMENT", ifc_name: "IfcOpeningElement", storey, why }));
        try {
          if (n >= HOLES) no(`more than ${HOLES} holes in one floor — the rest are not read; a person cuts them`);
          let loop;
          if (it.hole) { if (!it.hole.loop) no(CURVED_HOLE); loop = it.hole.loop; }
          else {
            if (fillerOf.has(it.oid)) no(`an opening filled by ${prose(L(fillerOf.get(it.oid)), fillerOf.get(it.oid))}`);
            if (!o.Representation) no("an opening with no body");
            const body = bodyOf(o, placementOf(ref(o.ObjectPlacement)), { why: null });
            if (body?.kind !== "extrusion") no("a hole that is not an upright extrusion of a straight outline — the floor is proposed whole; a person cuts it");
            try { loop = profileOf(body.profile).outer.map((p) => at(body.T, [p[0], p[1], 0]).slice(0, 2).map(r1)); } catch (e) { if (e instanceof NotRead) no(CURVED_HOLE); throw e; }
          }
          out.openings.push({ global_id: gx, host: hg, host_kind: "floor", storey, loop });
        } catch (e) { said(hurt(e)); }
      });
      continue;
    }
    for (const oid of openingsOf.get(hid) ?? []) {
      const o = L(oid);
      if (!o || reported.has(oid)) continue;
      reported.add(oid);
      if (claimed.has(oid)) continue;   // a door's or window's: its own record, or its own not_read row, carries it
      try {
        if (fillerOf.has(oid)) no(`an opening filled by ${prose(L(fillerOf.get(oid)), fillerOf.get(oid))}`);
        const t = isRevit ? tagOf(o) : "";
        if (t && curtainTags.has(t)) no("the cut a curtain wall embeds in — not an opening");
        if (t && t === tagOf(hl)) no("a cut in the wall's own geometry (a join or an edited profile) — a person decides");
        // the Tag names an element that is neither: a window's second void, a column's or a proxy's cut — never a plain opening (amendment 1)
        const maker = t ? (byTag.get(t) ?? []).find((x) => x !== hid) : null;
        if (maker != null && (doorIds.has(maker) || windowIds.has(maker))) {
          const wh = hostRec.get(voidHost.get(doorOpening.get(maker)))?.rec.global_id;
          no(`a further cut of ${prose(L(maker), maker)} ${gidOf(L(maker), maker)}${wh ? ` (it stands in ${wh})` : ""} — a person decides`);
        }
        if (maker != null) no(`a cut made by ${prose(L(maker), maker)} ${gidOf(L(maker), maker)} — a person decides`);
        out.openings.push({ global_id: gidOf(o, oid), host: hg, host_kind: "wall", storey, ...wallBox(oid, h.rec) });
      } catch (e) { skip(oid, o, storey, hurt(e)); }
    }
  }

  for (const id of [...doorIds, ...windowIds]) {
    const l = L(id);
    if (!l) continue;
    reported.add(id);
    try {
      const gid = gidOf(l, id);
      if (seen.has(gid)) no("GlobalId repeated");
      seen.add(gid);
      const oid = doorOpening.get(id);
      if (oid == null) no("no opening relation — a window in a curtain wall, or not cut");
      const host = hostRec.get(voidHost.get(oid));
      if (host?.kind !== "wall") no("its opening is in no wall this reader read (a curtain wall, a curved wall …) — a person places it");
      const b = wallBox(oid, host.rec), ow = num(l.OverallWidth), oh = num(l.OverallHeight);
      const rec = { global_id: gid, name: clean(val(l.Name) ?? gid), ifc_class: className(l, id), type_name: clean(val(L(typeOf.get(id))?.Name) ?? ""), host: host.rec.global_id, opening: gidOf(L(oid), oid), storey: host.rec.storey,
        along_mm: b.along_mm, width_mm: ow > 0 ? r1(ow * mm) : b.width_mm, height_mm: oh > 0 ? r1(oh * mm) : b.height_mm, sill_mm: b.sill_mm };
      (doorIds.has(id) ? out.doors : out.windows).push(rec);
    } catch (e) { skip(id, l, storeyOf.get(id) ?? null, hurt(e)); }
  }

  // a column: an extrusion of a rectangle, a circle or a 4-corner outline, or a B-rep box (Revit's mapped bodies included); the width is its first edge
  const rectSection = (q) => {
    if (!rect4(q)) no(NOT_SECTION);
    const deg = Math.round(((Math.atan2(q[1][1] - q[0][1], q[1][0] - q[0][0]) * 180 / Math.PI) % 360 + 360) % 360 * 100) / 100 % 360;
    return { shape: "rect", at: [0, 1].map((k) => q.reduce((s, p) => s + p[k], 0) / 4), width_mm: r1(e4(q, 0)), depth_mm: r1(e4(q, 1)), rotation_deg: deg };
  };
  const boxOfPoints = (pts) => {
    const z0 = Math.min(...pts.map((p) => p[2])), z1 = Math.max(...pts.map((p) => p[2])), cs = [];
    if (!(z1 - z0 > 1)) no("a flat body");
    for (const p of pts) {
      if (Math.abs(p[2] - z0) > 1 && Math.abs(p[2] - z1) > 1) no(NOT_SECTION);   // one band of height: a prism
      if (!cs.some((c) => Math.hypot(c[0] - p[0], c[1] - p[1]) < 1)) { if (cs.length === 4) no(NOT_SECTION); cs.push([p[0], p[1]]); }
    }
    if (cs.length !== 4) no(NOT_SECTION);
    const m = [0, 1].map((k) => cs.reduce((s, p) => s + p[k], 0) / 4);
    cs.sort((a, b) => Math.atan2(a[1] - m[1], a[0] - m[0]) - Math.atan2(b[1] - m[1], b[0] - m[0]));   // anticlockwise, from the lowest corner
    const k = cs.reduce((best, p, i) => (p[1] < cs[best][1] - 1 || (Math.abs(p[1] - cs[best][1]) <= 1 && p[0] < cs[best][0]) ? i : best), 0);
    return { ...rectSection([...cs.slice(k), ...cs.slice(0, k)]), z0, z1 };
  };
  const loadBearing = (g) => truth(g.psets.find((p) => p.name === "Pset_ColumnCommon")?.rows.find((r) => r.name === "LoadBearing")?.value);
  for (const id of idsOf(api, mid, WebIFC.IFCCOLUMN)) {
    const l = L(id);
    if (!l) continue;
    reported.add(id);
    const storey = storeyOf.get(id) ?? null;
    try {
      const gid = gidOf(l, id);
      if (seen.has(gid)) no("GlobalId repeated");
      seen.add(gid);
      if (storey == null) no("not on a storey");
      const F = placedUpright(l.ObjectPlacement), passed = { why: null }, body = bodyOf(l, F, passed);
      if (!body) no(passed.why ? `a column whose body is not read (${passed.why})` : "a column with no body");
      if (body.solids > 1) no(`a body of ${body.solids} solids — one outline only`);
      let sec, z0 = body.z0, z1 = body.z1;
      if (body.kind !== "extrusion") ({ z0, z1, ...sec } = boxOfPoints(bodyPoints(l, F)));
      else {
        const p = L(body.profile);
        if (p?.type === WebIFC.IFCCIRCLEPROFILEDEF) {
          const r = (num(p.Radius) ?? 0) * mm;
          if (!(r > 0)) no(NOT_SECTION);
          sec = { shape: "circle", at: at(body.T, [...frame2(p.Position).o.slice(0, 2), 0]).slice(0, 2), diameter_mm: r1(2 * r), rotation_deg: 0 };
        } else {
          let q;
          try { q = profileOf(body.profile).outer.map((x) => at(body.T, [x[0], x[1], 0]).slice(0, 2)); } catch (e) { if (e instanceof NotRead) no(NOT_SECTION); throw e; }
          sec = rectSection(q);
        }
      }
      if (!(Math.abs(z1 - z0) > 1)) no("no height");
      const g = await elementPsets(api, mid, id);
      out.columns.push({ global_id: gid, name: clean(val(l.Name) ?? gid), type_name: clean(val(L(typeOf.get(id))?.Name) ?? ""), storey, at: sec.at.map(r1), shape: sec.shape,
        ...(sec.shape === "circle" ? { diameter_mm: sec.diameter_mm } : { width_mm: sec.width_mm, depth_mm: sec.depth_mm }), rotation_deg: sec.rotation_deg,
        base_mm: r1(Math.min(z0, z1)), top_mm: r1(Math.max(z0, z1)), load_bearing: loadBearing(g), ...(body.clipped ? { note: "body clipped — its top is before the clip" } : {}) });
    } catch (e) { skip(id, l, storey, hurt(e)); }
  }

  // a curtain wall: its Axis, else the straight line through its parts (plates and mullions: neither is placed, its curtain type draws them)
  const partPoints = (id) => {
    const pts = [];
    for (const c of partsOf.get(id) ?? []) {
      const cl = L(c);
      if (!cl?.Representation) continue;
      try { for (const p of bodyPoints(cl, placementOf(ref(cl.ObjectPlacement))) ?? []) { pts.push(p); if (pts.length > MAX_PTS) no(`parts of more than ${MAX_PTS} points`); } } catch (e) { if (!(e instanceof NotRead) || /more than/.test(e.message)) throw e; }   // a part it cannot read adds nothing
    }
    return pts;
  };
  for (const id of curtainIds) {
    const l = L(id);
    if (!l) continue;
    reported.add(id);
    const storey = storeyOf.get(id) ?? null;
    try {
      const gid = gidOf(l, id);
      if (seen.has(gid)) no("GlobalId repeated");
      seen.add(gid);
      if (storey == null) no("not on a storey");
      const F = placedUpright(l.ObjectPlacement), g = await elementPsets(api, mid, id);
      let line = axisOf(l, F), from = "axis", own = null;
      try { own = l.Representation ? bodyPoints(l, F) : null; } catch (e) { if (!(e instanceof NotRead)) throw e; }
      const pp = line && own ? [] : partPoints(id);
      if (!line) {
        from = "parts";
        if (pp.length < 2) no("a curtain wall with no Axis and no parts to read a line from");
        // the principal direction of the parts' plan points (their covariance): a plate's corners are not on its mid-line, so the farthest pair is skewed
        const mx = pp.reduce((m, p) => m + p[0], 0) / pp.length, my = pp.reduce((m, p) => m + p[1], 0) / pp.length;
        const sxx = pp.reduce((m, p) => m + (p[0] - mx) ** 2, 0), syy = pp.reduce((m, p) => m + (p[1] - my) ** 2, 0), sxy = pp.reduce((m, p) => m + (p[0] - mx) * (p[1] - my), 0);
        const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), u = [Math.cos(th), Math.sin(th), 0], a = [mx, my];
        const n = [-u[1], u[0]], s = pp.map((p) => (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1]), d = pp.map((p) => (p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1]);
        const d0 = Math.min(...d), d1 = Math.max(...d), dm = (d0 + d1) / 2;
        if (d1 - d0 > 1000) no("a curtain wall that is not straight");   // plates sit mid-band and mullions at many depths: the band is the wall's, not a line of points
        line = [Math.min(...s), Math.max(...s)].map((t) => [a[0] + u[0] * t + n[0] * dm, a[1] + u[1] * t + n[1] * dm]);
        if (Math.hypot(line[1][0] - line[0][0], line[1][1] - line[0][1]) < 10) no("a curtain wall whose parts have no length");
      }
      const zs = (own ?? (pp.length ? pp : partPoints(id))).map((p) => p[2]);
      if (!zs.length) no("a curtain wall with no body or parts to read a height from");
      const base = Math.min(...zs), top = Math.max(...zs);
      if (!(top - base > 1)) no("no height");
      out.curtain_walls.push({ global_id: gid, name: clean(val(l.Name) ?? gid), type_name: clean(val(L(typeOf.get(id))?.Name) ?? ""), storey, start: line[0].map(r1), end: line[1].map(r1),
        base_mm: r1(base), height_mm: r1(top - base), is_external: external(g, "Pset_CurtainWallCommon"), from });
    } catch (e) { skip(id, l, storey, hurt(e)); }
  }

  // a stair is boxed, not read: 8-9 turns the box into a flag row for a person (the stair, its flights and landings, in the IFC's frame)
  for (const id of stairIds) {
    const l = L(id);
    if (!l) continue;
    let box = null, boxWhy = null;
    try {
      const pts = [];
      for (const x of [id, ...(partsOf.get(id) ?? [])]) {
        const xl = L(x);
        if (!xl?.Representation) continue;
        try { for (const p of bodyPoints(xl, placementOf(ref(xl.ObjectPlacement))) ?? []) { pts.push(p); if (pts.length > MAX_PTS) no(`a stair of more than ${MAX_PTS} points`); } } catch (e) { if (!(e instanceof NotRead) || /more than/.test(e.message)) throw e; }
      }
      if (pts.length) box = { min: [0, 1, 2].map((k) => r1(Math.min(...pts.map((p) => p[k])))), max: [0, 1, 2].map((k) => r1(Math.max(...pts.map((p) => p[k])))) };
      else boxWhy = "no body this reader reads";
    } catch (e) { boxWhy = hurt(e); }
    skip(id, l, storeyOf.get(id) ?? null, "a stair — this reader boxes stairs but does not place them; a person places it", { box, ...(box ? {} : { box_why: boxWhy }) });
  }

  // everything else that is an element: said, never silently dropped. A piece of a curtain wall or stair says whose; an opening of a host this reader did not read says so.
  const featureIds = new Set(idsOf(api, mid, WebIFC.IFCFEATUREELEMENT));
  for (const id of idsOf(api, mid, WebIFC.IFCELEMENT)) {
    if (reported.has(id) || claimed.has(id)) continue;
    const l = L(id);
    if (!l) continue;
    const storey = storeyOf.get(id) ?? null;
    if (partOf.has(id)) skip(id, l, storey, partWhy(id));
    else if (featureIds.has(id)) {
      const h = voidHost.get(id), hl = L(h);
      skip(id, l, storeyOf.get(h) ?? storey, hl && curtainIds.has(h) && out.curtain_walls.some((c) => c.global_id === gidOf(hl, h)) ? `a cut in curtain wall ${gidOf(hl, h)} — its curtain type draws it; not an opening`
        : hl ? `an opening in ${prose(hl, h)} ${gidOf(hl, h)}, which this reader did not read — a person cuts it` : `an ${prose(l, id)} with no host — a person cuts it`);
    } else skip(id, l, storey, `an ${prose(l, id)} — sentinel-ifc ${VERSION} reads walls, floors, openings, doors, windows, columns and curtain walls; a person places it`);
  }
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
    const tn = (R(ctx?.TrueNorth)?.DirectionRatios ?? []).map(num);
    if (tn.length >= 2 && tn.every(Number.isFinite)) out.hint.true_north = tn.slice(0, 2).map((v) => Math.round(v * 1e6) / 1e6);
    if (ctx?.WorldCoordinateSystem) {
      const F = frame3(ref(ctx.WorldCoordinateSystem));
      out.hint.context_wcs_not_origin = Math.hypot(...F.o) > 0.1 || Math.abs(F.x[0] - 1) > 1e-9 || Math.abs(F.z[2] - 1) > 1e-9;
    }
  } catch { /* an unreadable WCS is not a finding */ }
  return out;
}

// ── MA-6-8: the job (build-jobs runs it in this process on the newest admitted concept IFC) ────────────────────────────────────
// ponytail: web-ifc's OpenModel is synchronous in the bridge, bounded by the 64 MB admission cap (MA-8-3, D3; intake and manifests do the same with
// larger files). ~1 s per 25 MB measured, so a vendor IFC over ~50 MB blocks the event loop past 2 s: the worker_threads worker is due then.
const toolsOf = () => {
  let web = "0.0.77";
  try { web = JSON.parse(readFileSync(resolve(WASM_DIR, "package.json"), "utf8")).version ?? web; } catch { /* the installed version is the pinned one */ }
  return [{ name: IFC, version: VERSION, licence: "proprietary" }, { name: "web-ifc", version: web, licence: "MPL-2.0" }, { name: "Node", version: process.versions.node, licence: "MIT" }];
};
/** job {job_id, items: [{id, kind, path, sha256}], params, seed} → {status, version, tools, refused, result?, error?}. Never rejects.
 *  `measured` holds finite numbers only: a wall or floor missing one goes to not_read, never into the result with a null. */
export async function runIfc(job) {
  const t0 = process.cpuUsage(), refused = [], candidates = [], notRead = [];
  let first = null;
  try {
    for (const it of job.items) {
      let bytes;
      // the file at the admitted path is untrusted until its hash is checked: its size first, before it is read into the heap
      try { const big0 = sizeRefusal("ifc", statSync(it.path).size, "model"); if (big0) { refused.push({ id: it.id, reason: big0 }); continue; } bytes = readFileSync(it.path); } catch (e) { refused.push({ id: it.id, reason: `could not be read (${e?.code || "the read failed"})` }); continue; }
      const big = sizeRefusal("ifc", bytes.length, "model");
      if (big) { refused.push({ id: it.id, reason: big }); continue; }
      if (createHash("sha256").update(bytes).digest("hex") !== it.sha256) { refused.push({ id: it.id, reason: "not the bytes admitted (sha256)" }); continue; }
      const r = await readIfcGeometry(bytes);
      first ??= r;
      const ev = (g) => [`${it.id}#${g}`], fin = (o) => Object.values(o).every(Number.isFinite);
      const noLevel = new Set(), lost = (x, why) => notRead.push({ global_id: x.global_id, ifc_class: x.ifc_class, storey: x.storey, why, item: it.id });
      for (const l of r.levels) {
        if (!fin({ elevation_mm: l.elevation_mm })) { noLevel.add(l.cid); lost({ ...l, ifc_class: "IFCBUILDINGSTOREY", storey: l.cid }, "a storey with no elevation"); continue; }
        candidates.push({ cid: l.cid, kind: "level", geometry: { BaseElevation: l.elevation_mm, name: l.name, global_id: l.global_id }, measured: { elevation_mm: l.elevation_mm }, evidence: ev(l.global_id) }); }
      for (const w of r.walls) {
        const m = { thickness_mm: w.thickness_mm, height_mm: w.height_mm, length_mm: r1(Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])) };
        if (noLevel.has(w.storey)) { lost(w, "its storey has no elevation"); continue; }
        if (!fin(m)) { lost(w, "a measurement is missing"); continue; }
        candidates.push({ cid: w.global_id, kind: "wall", evidence: ev(w.global_id), measured: m, geometry: { storey: w.storey, LocationCurve: { start: w.start, end: w.end },
          BaseElevation: w.base_mm, TopElevation: r1(w.base_mm + w.height_mm), name: w.name, ifc_class: w.ifc_class, ifc_type_name: w.type_name, thickness_from: w.thickness_from, is_external: w.is_external, clipped: w.clipped, body: w.body, ...(w.note ? { note: w.note } : {}) } });
      }
      for (const f of r.floors) {
        const m = { thickness_mm: f.thickness_mm, area_m2: Math.round(area2(f.loop) / 1e4) / 100 };
        if (noLevel.has(f.storey)) { lost(f, "its storey has no elevation"); continue; }
        if (!fin(m)) { lost(f, "a measurement is missing"); continue; }
        candidates.push({ cid: f.global_id, kind: "floor", evidence: ev(f.global_id), measured: m, geometry: { storey: f.storey, LocationLoop: f.loop, TopElevation: f.top_mm, name: f.name, ifc_class: f.ifc_class, is_external: f.is_external } });
      }
      // MA-8-4: openings, doors, windows, columns and curtain walls. A measured number that is missing sends the element to not_read, as above.
      const place = (x, kind, cls, geometry, measured) => {
        if (noLevel.has(x.storey)) { lost({ ...x, ifc_class: cls }, "its storey has no elevation"); return; }
        if (!fin(measured)) { lost({ ...x, ifc_class: cls }, "a measurement is missing"); return; }
        candidates.push({ cid: x.global_id, kind, evidence: ev(x.global_id), measured, geometry: { storey: x.storey, ...geometry } });
      };
      for (const o of r.openings)
        place(o, "opening", "IFCOPENINGELEMENT", o.loop ? { host: o.host, host_kind: "floor", Boundary: o.loop } : { host: o.host, host_kind: "wall", along_mm: o.along_mm }, o.loop ? { area_m2: Math.round(area2(o.loop) / 1e4) / 100 } : { width_mm: o.width_mm, height_mm: o.height_mm, sill_mm: o.sill_mm });
      for (const d of [...r.doors.map((x) => ["door", x]), ...r.windows.map((x) => ["window", x])])
        place(d[1], d[0], d[1].ifc_class, { host: d[1].host, opening: d[1].opening, along_mm: d[1].along_mm, name: d[1].name, ifc_class: d[1].ifc_class, ifc_type_name: d[1].type_name }, { width_mm: d[1].width_mm, height_mm: d[1].height_mm, sill_mm: d[1].sill_mm });
      for (const c of r.columns)
        place(c, "column", "IFCCOLUMN", { Location: c.at, shape: c.shape, rotation_deg: c.rotation_deg, base_mm: c.base_mm, top_mm: c.top_mm, load_bearing: c.load_bearing, name: c.name, ifc_type_name: c.type_name, ...(c.note ? { note: c.note } : {}) },
          { ...(c.shape === "circle" ? { diameter_mm: c.diameter_mm } : { width_mm: c.width_mm, depth_mm: c.depth_mm }), height_mm: r1(c.top_mm - c.base_mm) });
      for (const w of r.curtain_walls)   // a wall of the planner's, flagged: no thickness (its type draws the panels)
        place(w, "wall", "IFCCURTAINWALL", { LocationCurve: { start: w.start, end: w.end }, BaseElevation: w.base_mm, TopElevation: r1(w.base_mm + w.height_mm), name: w.name, ifc_class: "IFCCURTAINWALL", ifc_type_name: w.type_name, is_external: w.is_external, curtain: true, from: w.from },
          { height_mm: w.height_mm, length_mm: r1(Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])) });
      notRead.push(...r.not_read.map((n) => ({ ...n, item: it.id })));
    }
  } catch (e) { return { status: "failed", error: `the IFC could not be read: ${clean(e?.message, 300)}`, version: VERSION, tools: toolsOf(), refused }; }
  if (!first) return { status: "refused", error: "no admitted concept IFC could be read — " + (refused.map((x) => `${x.id}: ${x.reason}`).join("; ") || "no item"), version: VERSION, tools: toolsOf(), refused };
  const cpu = process.cpuUsage(t0);
  return { status: "done", version: VERSION, tools: toolsOf(), refused,
    result: { candidates, derived: [], receipt: { not_read: notRead, not_read_by_class: notRead.reduce((m, n) => ({ ...m, [n.ifc_class]: (m[n.ifc_class] ?? 0) + 1 }), {}), hint: first.hint, schema: first.schema, mm_per_unit: first.mm_per_unit, cpu_s: Math.round((cpu.user + cpu.system) / 1e4) / 100 } } };
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
  p(`openings (${r.openings.length}):`);
  for (const o of r.openings) p(`  ${o.global_id} · ${o.storey} · in ${o.host_kind} ${o.host} · ${o.loop ? `${o.loop.length} corners` : `${o.width_mm} x ${o.height_mm} mm, sill ${o.sill_mm}, ${o.along_mm} along`}`);
  for (const [k, list] of [["doors", r.doors], ["windows", r.windows]]) {
    p(`${k} (${list.length}):`);
    for (const d of list) p(`  ${d.global_id} · ${d.storey} · ${d.width_mm} x ${d.height_mm} mm, sill ${d.sill_mm}, ${d.along_mm} along ${d.host} · ${d.type_name}`);
  }
  p(`columns (${r.columns.length}):`);
  for (const c of r.columns) p(`  ${c.global_id} · ${c.storey} · ${xy(c.at)} · ${c.shape === "circle" ? `d ${c.diameter_mm}` : `${c.width_mm} x ${c.depth_mm}`} mm turned ${c.rotation_deg}° · ${c.base_mm} to ${c.top_mm} · load bearing ${c.load_bearing}${c.note ? ` · ${c.note}` : ""}`);
  p(`curtain walls (${r.curtain_walls.length}):`);
  for (const w of r.curtain_walls) p(`  ${w.global_id} · ${w.storey} · ${xy(w.start)} → ${xy(w.end)} · h ${w.height_mm} from ${w.base_mm} · from ${w.from}`);
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
