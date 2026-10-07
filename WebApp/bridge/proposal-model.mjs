// MA-3d2 — the proposal model: a changeset's creates as the IFC writer's boxes, written as IFC and converted to fragments by the
// bridge's own importer (the outbox's engine). Nothing of it is a version: it is a view of what Apply would make, in the frame the
// executor places in (ChangesetExecutor: a wall's LocationCurve, base and top; a floor's Boundary at its level). Pure where it can be.
const MM = 1 / 1000;
export const SKETCH_HEIGHT_MM = 3000;   // a wall whose top the proposal did not send (the add-in's sketch height)
export const SKETCH_THICKNESS_MM = 200; // a wall or slab whose thickness the proposal did not send

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
      const top = p.TopElevation ?? base + SKETCH_HEIGHT_MM;
      if (top <= base) { out.skipped.push(`${name}: a wall whose top is not above its base`); continue; }
      const mx = (c.start[0] + c.end[0]) / 2, my = (c.start[1] + c.end[1]) / 2, mz = base + (top - base) / 2;
      out.elements.push({ kind: "wall", size: { x: len * MM, y: (top - base) * MM, z: thickMm * MM }, position: [mx * MM, mz * MM, -my * MM], rotationY: Math.atan2(dy, dx), typeName: p.TypeName ?? undefined, name });
      out.drawn++;
      continue;
    }
    if (el.kind === "floor" || el.kind === "roof" || el.kind === "ceiling") {
      const loop = (p.Boundary ?? p.LocationLoop ?? []).filter((q) => Array.isArray(q) && q.length >= 2);
      if (loop.length < 3) { out.skipped.push(`${name}: a ${el.kind} with no boundary`); continue; }
      const xs = loop.map((q) => q[0]), ys = loop.map((q) => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      if (x1 - x0 < 1 || y1 - y0 < 1) { out.skipped.push(`${name}: a ${el.kind} with no area`); continue; }
      // a floor's or roof's top sits at its level: its centre is half a thickness below; a ceiling's underside hangs at its offset above.
      const centreZ = el.kind === "ceiling" ? base + (p.Offset ?? 0) + thickMm / 2 : base - thickMm / 2;
      out.elements.push({ kind: "slab", size: { x: (x1 - x0) * MM, y: thickMm * MM, z: (y1 - y0) * MM }, position: [((x0 + x1) / 2) * MM, centreZ * MM, -((y0 + y1) / 2) * MM], rotationY: 0, typeName: p.TypeName ?? undefined, name });
      out.drawn++;
      continue;
    }
    out.skipped.push(`${name}: a ${el.kind} — not drawn (the proposal model draws walls, floors, roofs and ceilings as boxes)`);
  }
  return out;
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
