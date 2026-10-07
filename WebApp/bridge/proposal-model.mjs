// MA-3d2 — the proposal model: a changeset's creates as the IFC writer's boxes, written as IFC and converted to fragments by the
// bridge's own importer (the outbox's engine). Nothing of it is a version: it is a view of what Apply would make, in the frame the
// executor places in (ChangesetExecutor: a wall's LocationCurve, base and top; a floor's Boundary at its level). Pure where it can be.
const MM = 1 / 1000;
export const SKETCH_HEIGHT_MM = 3000;   // a wall whose top the proposal did not send (the add-in's sketch height)
export const SKETCH_THICKNESS_MM = 200; // a wall or slab whose thickness the proposal did not send
export const SKETCH_DOOR_MM = { w: 915, h: 2134 };          // a door whose type name carries no "W x H"
export const SKETCH_WINDOW_MM = { w: 1000, h: 1000, sill: 900 }; // a window likewise; its sill when none was sent
const SIZE_IN_NAME = /(\d{3,4})\s*[x\u00d7]\s*(\d{3,4})/i;  // DR-1: a concept door's type is named "0915 x 2134"

/** MA-3d2 Next: the level elevations the changeset itself tells — a level create's BaseElevation under its name; a floor's loop,
 *  a wall's line and a point family's Location each carry their level's z (the executor refuses any other). Returns
 *  `(place) => mm | null` for the proposal model (a level named here but known to no element is still null → elevation 0). */
export function levelsOf(cs) {
  const byName = new Map();
  const tell = (name, z) => { if (typeof name === "string" && name && Number.isFinite(z) && !byName.has(name)) byName.set(name, z); };
  for (const el of cs?.elements ?? []) {
    if ((el?.op ?? "create") !== "create" || !el.place) continue;
    const p = el.place;
    if (el.kind === "level") tell(el.validate?.identity?.Name ?? p.Name, p.BaseElevation);
    const lvl = p.LevelName ?? p.BaseLevel;
    if (Array.isArray(p.Location)) tell(lvl, p.Location[2]);
    if (Array.isArray(p.LocationCurve?.start)) tell(lvl, p.LocationCurve.start[2]);
    if (Array.isArray(p.LocationLoop) && Array.isArray(p.LocationLoop[0])) tell(lvl, p.LocationLoop[0][2]);
  }
  return (place) => byName.get(place?.LevelName ?? place?.BaseLevel) ?? null;
}

/** The host wall under a door's or window's point — a wall create of the same changeset whose line passes within half its
 *  thickness (+50 mm) of the point: its plan angle and thickness; null when none (drawn unturned, 200 mm). */
function hostOf(cs, loc) {
  for (const el of cs?.elements ?? []) {
    if ((el?.op ?? "create") !== "create" || el.kind !== "wall") continue;
    const c = el.place?.LocationCurve;
    if (!Array.isArray(c?.start) || !Array.isArray(c?.end)) continue;
    const dx = c.end[0] - c.start[0], dy = c.end[1] - c.start[1], len = Math.hypot(dx, dy);
    if (!(len >= 1)) continue;
    const t = ((loc[0] - c.start[0]) * dx + (loc[1] - c.start[1]) * dy) / (len * len);
    if (t < 0 || t > 1) continue;
    const dist = Math.abs((loc[0] - c.start[0]) * dy - (loc[1] - c.start[1]) * dx) / len;
    const thick = el.place.Thickness > 0 ? el.place.Thickness : SKETCH_THICKNESS_MM;
    if (dist <= thick / 2 + 50) return { angle: Math.atan2(dy, dx), thick };
  }
  return null;
}

/** The creates with a shape, as the writer's elements (metres, three.js Y-up, box centres) — and what was skipped, each with why. */
export function proposalElements(cs, levelMmOf = () => null) {
  const out = { elements: [], creates: 0, drawn: 0, skipped: [] };
  for (const el of cs?.elements ?? []) {
    if ((el?.op ?? "create") !== "create" || !el.place) continue;
    out.creates++;
    const p = el.place, name = el.validate?.identity?.Name ?? el.proposal_guid ?? el.kind;
    const base = p.BaseElevation ?? levelMmOf(p) ?? 0;
    const thickMm = p.Thickness > 0 ? p.Thickness : SKETCH_THICKNESS_MM;
    if (el.kind === "wall") {
      const c = p.LocationCurve;
      if (!Array.isArray(c?.start) || !Array.isArray(c?.end) || c.start.length < 2 || c.end.length < 2) { out.skipped.push(`${name}: a wall with no line`); continue; }
      const dx = c.end[0] - c.start[0], dy = c.end[1] - c.start[1], len = Math.hypot(dx, dy);
      if (!Number.isFinite(len) || len < 1) { out.skipped.push(`${name}: a wall shorter than 1 mm`); continue; }
      const wallBase = p.BaseElevation ?? (Number.isFinite(c.start[2]) ? c.start[2] : base);
      const top = p.TopElevation ?? wallBase + SKETCH_HEIGHT_MM;
      if (top <= wallBase) { out.skipped.push(`${name}: a wall whose top is not above its base`); continue; }
      const mx = (c.start[0] + c.end[0]) / 2, my = (c.start[1] + c.end[1]) / 2, mz = wallBase + (top - wallBase) / 2;
      out.elements.push({ kind: "wall", size: { x: len * MM, y: (top - wallBase) * MM, z: thickMm * MM }, position: [mx * MM, mz * MM, -my * MM], rotationY: Math.atan2(dy, dx), typeName: p.TypeName ?? undefined, name });
      out.drawn++;
      continue;
    }
    if (el.kind === "floor" || el.kind === "roof" || el.kind === "ceiling") {
      let loop = (p.Boundary ?? p.LocationLoop ?? []).filter((q) => Array.isArray(q) && q.length >= 2);
      if (loop.length > 3 && loop[0][0] === loop[loop.length - 1][0] && loop[0][1] === loop[loop.length - 1][1]) loop = loop.slice(0, -1); // a closing point
      if (loop.length < 3) { out.skipped.push(`${name}: a ${el.kind} with no boundary`); continue; }
      const xs = loop.map((q) => q[0]), ys = loop.map((q) => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      if (x1 - x0 < 1 || y1 - y0 < 1) { out.skipped.push(`${name}: a ${el.kind} with no area`); continue; }
      // a floor's loop carries its level's z (the executor refuses any other); the proposal's BaseElevation, if sent, wins.
      const slabBase = p.BaseElevation ?? (el.kind === "floor" && Number.isFinite(loop[0][2]) ? loop[0][2] : base);
      // a floor's or roof's top sits at its level: its centre is half a thickness below; a ceiling's underside hangs at its offset above.
      const centreZ = el.kind === "ceiling" ? slabBase + (p.Offset ?? 0) + thickMm / 2 : slabBase - thickMm / 2;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      // the true outline, relative to the box centre, in the writer's local plan frame (rotationY 0: local x = X, local y = Y).
      const footprint = loop.map((q) => [(q[0] - cx) * MM, (q[1] - cy) * MM]);
      out.elements.push({ kind: "slab", size: { x: (x1 - x0) * MM, y: thickMm * MM, z: (y1 - y0) * MM }, position: [cx * MM, centreZ * MM, -cy * MM], rotationY: 0, typeName: p.TypeName ?? undefined, name, footprint });
      out.drawn++;
      continue;
    }
    if (el.kind === "door" || el.kind === "window") {
      const loc = p.Location;
      if (!Array.isArray(loc) || loc.length < 2) { out.skipped.push(`${name}: a ${el.kind} with no point`); continue; }
      const sketch = el.kind === "door" ? SKETCH_DOOR_MM : SKETCH_WINDOW_MM;
      const m = SIZE_IN_NAME.exec(p.TypeName ?? "");
      const w = m ? Number(m[1]) : sketch.w, h = m ? Number(m[2]) : sketch.h;
      const host = hostOf(cs, loc);
      const sill = el.kind === "window" ? (p.SillHeight ?? SKETCH_WINDOW_MM.sill) : 0;
      const z0 = (p.BaseElevation ?? (Number.isFinite(loc[2]) ? loc[2] : levelMmOf(p) ?? 0)) + sill;
      out.elements.push({ kind: el.kind, size: { x: w * MM, y: h * MM, z: (host?.thick ?? SKETCH_THICKNESS_MM) * MM }, position: [loc[0] * MM, (z0 + h / 2) * MM, -loc[1] * MM], rotationY: host?.angle ?? 0, typeName: p.TypeName ?? undefined, name });
      out.drawn++;
      continue;
    }
    out.skipped.push(`${name}: a ${el.kind} — not drawn (the proposal model draws walls, floors, roofs, ceilings, doors and windows as boxes)`);
  }
  return out;
}

/** MA-3d3: a storey's parts (Revit's StoreyBatch files " (i/n)" changesets) as ONE changeset for the proposal model — the creates
 *  in filing order, the name without its part, so a level create in one part tells the others' elevations (levelsOf) and the desk
 *  loads one model per storey. Pure. */
export function storeyModel(changesets) {
  const list = (changesets ?? []).filter(Boolean);
  const name = (list[0]?.name ?? "").replace(/ \((\d+)\/(\d+)\)$/, "");
  return { id: "storey", name, elements: list.flatMap((cs) => cs.elements ?? []), parts: list.map((cs) => cs.id) };
}

/** The proposal model's bytes (.frag) and counts. deps: { buildIfc, ifcBytesToFrag } (tests inject; the defaults are the core bundle and ifc-to-frag). */
export async function proposalFrag(cs, levelMmOf, deps = {}) {
  const buildIfc = deps.buildIfc ?? (await import("./sentinel-core.mjs")).buildIfc;
  const ifcBytesToFrag = deps.ifcBytesToFrag ?? (await import("./ifc-to-frag.mjs")).ifcBytesToFrag;
  const plan = proposalElements(cs, levelMmOf);
  if (plan.drawn === 0) return { ...plan, bytes: null };
  const ifc = buildIfc(plan.elements, { projectName: `proposal · ${cs.name ?? cs.id}`, timestamp: 0 });
  const bytes = await ifcBytesToFrag(new TextEncoder().encode(ifc));
  return { ...plan, bytes };
}
