// MA-4d — inside or outside, read from the storey's own walls: SentinelAddin/GhostBuilder/WallLocation.cs (MA-2a, with drill MA2a's linings
// and review C23's overlaps) ported rule for rule, so a survey wall is typed by the same office rule Promote types a Revit wall by — the
// layer-free guideline's "an outside wall — one side looks out of the storey's outline". Pure 2D in millimetres; the cases are
// tools/promote-check/LayerFreePlanner.cs's (wall-location.test.mjs). The C# header says what "outside" means and the ceilings it states (a
// closed courtyard reads Interior; a ray escaping through a door gap reads that side open). Not ported: the curved-wall refusal — a survey
// wall is a straight centreline.
// ponytail: two copies of one rule held by the same cases, not by one fixture both read; a shared fixture when either changes again.
export const EXTERIOR = "Exterior", INTERIOR = "Interior";
const CLEAR_MM = 100;          // the sample points sit half the width plus this beyond each face
const MIN_LENGTH_MM = 500;     // shorter: its middle is too near its ends to look out from
const MIN_OTHERS = 3;          // fewer other walls is no outline
const TOL_MM = 1;              // a ray meets a wall within this
const LINING_MAX_MM = 50;      // a lining (a finish, a membrane drawn as a wall) is at most this thick
const PARALLEL_SIN = 0.0174524; // sin 1°

/** Wall `i` of the storey's `walls` ({x0, y0, x1, y1, width} in mm; null = a wall with no line read, skipped as a barrier) →
 *  {location: "Exterior" | "Interior" | null, why: null | the reason in words}. */
export function locate(walls, i) {
  const w = walls[i];
  if (!w) return { location: null, why: "no location line was read" };
  const others = walls.filter((x, j) => j !== i && x).length;
  if (others < MIN_OTHERS) return { location: null, why: `only ${others} other wall(s) on the storey — no outline to be inside or outside of` };
  const dx = w.x1 - w.x0, dy = w.y1 - w.y0, len = Math.hypot(dx, dy);
  if (len < MIN_LENGTH_MM) return { location: null, why: `${Math.round(len)} mm long — too short to look out from (under ${MIN_LENGTH_MM} mm)` };
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const mx = (w.x0 + w.x1) / 2, my = (w.y0 + w.y1) / 2, halfW = Math.max(0, w.width) / 2;
  const offPlus = sideOffset(walls, i, mx, my, nx, ny, ux, uy, halfW), offMinus = sideOffset(walls, i, mx, my, -nx, -ny, ux, uy, halfW);
  if (Number.isNaN(offPlus) || Number.isNaN(offMinus))
    return { location: null, why: "its sample point lies beyond another wall's centreline (overlapping walls) — a person decides" };
  if (insideAnother(walls, i, mx, my, ux, uy, halfW))
    return { location: null, why: "its body overlaps a parallel wall's body (a wall drawn inside another) — a person decides" };
  const plusOpen = open(walls, i, mx + nx * offPlus, my + ny * offPlus, nx, ny, ux, uy);
  const minusOpen = open(walls, i, mx - nx * offMinus, my - ny * offMinus, -nx, -ny, ux, uy);
  if (plusOpen !== minusOpen) return { location: EXTERIOR, why: null };
  if (!plusOpen) return { location: INTERIOR, why: null };
  return { location: null, why: "both sides look out to open plan — a free-standing wall, or the storey's walls do not close around it" };
}

// A side is open when a ray from its sample point — away from the wall, or along the wall either way — meets no other wall.
const open = (walls, i, px, py, ax, ay, ux, uy) => !hits(walls, i, px, py, ax, ay) || !hits(walls, i, px, py, ux, uy) || !hits(walls, i, px, py, -ux, -uy);
const hits = (walls, i, px, py, dx, dy) => walls.some((s, j) => j !== i && s && rayMeets(px, py, dx, dy, s));

/** Does the ray p + t·d (t > TOL_MM) meet segment s within TOL_MM? A proper crossing, or — parallel to it — an end of it on the ray. */
function rayMeets(px, py, dx, dy, s) {
  const ex = s.x1 - s.x0, ey = s.y1 - s.y0, rx = s.x0 - px, ry = s.y0 - py, den = dx * ey - dy * ex, elen = Math.hypot(ex, ey);
  if (elen < 1e-9) return onRay(px, py, dx, dy, s.x0, s.y0);
  if (Math.abs(den) < 1e-9 * elen) return onRay(px, py, dx, dy, s.x0, s.y0) || onRay(px, py, dx, dy, s.x1, s.y1);
  const t = (rx * ey - ry * ex) / den, u = (rx * dy - ry * dx) / den, slack = TOL_MM / elen;
  return t > TOL_MM && u >= -slack && u <= 1 + slack;
}
function onRay(px, py, dx, dy, qx, qy) {
  const vx = qx - px, vy = qy - py, t = vx * dx + vy * dy;
  return t > TOL_MM && Math.abs(vx * dy - vy * dx) <= TOL_MM;
}

/** How far beyond the wall's line one side's sample point sits: half its width plus CLEAR_MM, moved past each lining its sample segment
 *  crosses; NaN when it crosses a wall that is no lining (overlapping walls, C23). */
function sideOffset(walls, i, mx, my, sx, sy, ux, uy, halfW) {
  let off = halfW + CLEAR_MM;
  for (let pass = 0; pass <= walls.length; pass++) { // each pass moves past at least one more lining, or ends
    let moved = false;
    for (let j = 0; j < walls.length; j++) {
      const o = walls[j];
      if (j === i || !o) continue;
      const t = crossT(mx, my, mx + sx * off, my + sy * off, o);
      if (Number.isNaN(t)) continue;
      const ex = o.x1 - o.x0, ey = o.y1 - o.y0, el = Math.hypot(ex, ey), d = t * off, half = Math.max(0, o.width) / 2;
      // A lining: parallel, of known width, at most LINING_MAX_MM and thinner than this wall, its body starting at or past this wall's face.
      const lining = el >= 1e-9 && Math.abs(ux * ey - uy * ex) / el <= PARALLEL_SIN && o.width > 0 && o.width <= LINING_MAX_MM
        && o.width < 2 * halfW && d - half >= halfW - TOL_MM;
      if (!lining) return NaN;
      if (d + half + CLEAR_MM > off + TOL_MM) { off = d + half + CLEAR_MM; moved = true; }
    }
    if (!moved) return off;
  }
  return NaN;
}

/** Does this wall's body overlap a parallel wall's body (of known width) where its middle is? Abutting face to face is no overlap. */
function insideAnother(walls, i, mx, my, ux, uy, halfW) {
  return walls.some((o, j) => {
    if (j === i || !o || !(o.width > 0)) return false;
    const ex = o.x1 - o.x0, ey = o.y1 - o.y0, el = Math.hypot(ex, ey);
    if (el < 1e-9 || Math.abs(ux * ey - uy * ex) / el > PARALLEL_SIN) return false;
    const along = ((mx - o.x0) * ex + (my - o.y0) * ey) / (el * el), slack = TOL_MM / el;
    if (along < -slack || along > 1 + slack) return false;
    return Math.abs((mx - o.x0) * ey - (my - o.y0) * ex) / el < halfW + o.width / 2 - TOL_MM;
  });
}

/** Where segment a→b crosses segment s, as a fraction of a→b (past a, at most b), or NaN. */
function crossT(ax, ay, bx, by, s) {
  const dx = bx - ax, dy = by - ay, ex = s.x1 - s.x0, ey = s.y1 - s.y0, rx = s.x0 - ax, ry = s.y0 - ay, den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9 * Math.sqrt((dx * dx + dy * dy) * (ex * ex + ey * ey))) return NaN;
  const t = (rx * ey - ry * ex) / den, u = (rx * dy - ry * dx) / den;
  return t > 0 && t <= 1 && u >= 0 && u <= 1 ? t : NaN;
}
