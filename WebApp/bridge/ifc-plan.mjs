// MA-6-8 — a done sentinel-ifc job's candidates to changesets, the pure half (plan-b3 §2; the IFC twin of survey-plan planSurvey). One
// changeset per storey of creates the bridge builds from the job's own result: the lead's frame places the concept in the model (D5: the
// IFC's own world position is a hint, never applied), a wall's inside or outside is the IFC's IsExternal, else wall-location's reading, and
// every wall and floor is typed exactly (D16) by the project's typer. What the reader did not read is one exception a storey and IFC class
// (the full list stays on the job's receipt). Nothing is pre-ticked: what a concept says is not what was built.
// MA-8-4 (0.2.0): also the wall and floor openings, doors, windows, columns and curtain walls the reader now reads. A door, window, wall
// opening or column is pre-checked against what the executor will refuse (one basic wall under its point, a storey whose level is known, a
// curtain wall not in the way) so one bad opening never costs the storey's changeset; what fails is a held exception, in words.
// ponytail: the IFC's axes already meet — no trimEnds; level-bound wall tops (Promote DD attaches them) and curved walls are MA-8's.
import { MAX_CHANGESET_ELEMENTS, CREATE_ENTITY, outlineProblem } from "./changesets-logic.mjs";
import { KIND_CATEGORY } from "./changesets-typing.mjs";
import { toModel, placeRefusal, matchStoreys, gapOf, groupGaps, NOT_MEASURED, typeOpening, pointAlong, nominal } from "./survey-plan.mjs";
import { SIZE_BAND_MM, typeByDiameter, typeBySize, sectionOf, diameterOf } from "./holding-logic.mjs";
import { locate } from "./wall-location.mjs";

const err = (status, message) => Object.assign(new Error(message), { status });
export const PLANNER = "ifc-planner";
export const PLANNER_VERSION = "0.2.0";
/** A base or top more than this off its storey's level is held for a person (mm). */
export const LEVEL_MM = 2;
/** How far a point may lie from the one wall that hosts it (mm): PlacementGeometry.HostTolMm, which the executor checks at Apply. */
export const HOST_TOL_MM = 1;
const FROM = { layers: "material layers", type_layers: "the type's layers", base_quantities: "base quantities", body: "the body" };
const ID_SHOWN = 3;
/** MA-8-4: a curtain wall nearer than this to the middle of its storey's walls has no told outside (mm). */
const FACADE_MIN_MM = 500;
const r1 = (v) => Math.round(v * 10) / 10 || 0;

const byClass = (list) => { const m = new Map(); for (const n of list) m.set(n.ifc_class, [...(m.get(n.ifc_class) ?? []), n]); return m; };
const whysOf = (list) => [...new Set(list.map((n) => n.why))];
const nameOf = (list) => {
  const pretty = list[0].ifc_name ?? /^an (Ifc\w+) —/.exec(whysOf(list)[0] ?? "")?.[1] ?? `Ifc${list[0].ifc_class.slice(3).toLowerCase()}`;   // the reader's CamelCase name
  return `${pretty}${list.length > 1 ? ` × ${list.length}` : ` ${list[0].global_id}`}`.slice(0, 256);
};
const reasonOf = (list) => {
  const whys = whysOf(list);
  return `${whys[0]}${whys.length > 1 ? ` (and ${whys.length - 1} other reason(s))` : ""} · ${list.slice(0, ID_SHOWN).map((n) => n.global_id).join(", ")}${list.length > ID_SHOWN ? ", …" : ""}`.slice(0, 300);
};

/** MA-8-4: the side a wall faces, N, E, S or W, as ShellPlanner.Facade bins it (N [315, 45), E [45, 135), S [135, 225), W [225, 315); 45° is E),
 *  read in the IFC's own frame: the outward normal is the wall's normal that points away from `centroid` (the middle of the storey's walls),
 *  its bearing measured clockwise from `trueNorth` (the IFC's context TrueNorth, a direction; +Y when it states none). Pure. */
export function facadeOf(start, end, centroid, trueNorth = [0, 1]) {
  const dx = end[0] - start[0], dy = end[1] - start[1];
  const mx = (start[0] + end[0]) / 2 - centroid[0], my = (start[1] + end[1]) / 2 - centroid[1];
  let nx = -dy, ny = dx;   // the left normal, flipped when it points toward the centre
  if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
  const ccw = Math.atan2(trueNorth[0] * ny - trueNorth[1] * nx, trueNorth[0] * nx + trueNorth[1] * ny) * 180 / Math.PI;
  const deg = Math.round((((-ccw) % 360) + 360) % 360 * 1e6) / 1e6 % 360;   // rounded to 1e-6° so a float's noise never moves a tie
  return deg >= 315 || deg < 45 ? "N" : deg < 135 ? "E" : deg < 225 ? "S" : "W";
}

const dist = (a, b, p) => {   // PlacementGeometry.Distance: the point to the segment
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
};
// even-odd, a point on an edge (within a millimetre) counts as in: an opening flush with its floor's edge is in
const inLoop = (p, loop) => {
  let inside = false;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    if (dist(a, b, p) <= HOST_TOL_MM) return true;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < a[0] + (p[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1])) inside = !inside;
  }
  return inside;
};
const sameName = (s) => String(s ?? "").replace(/\s*:\s*/g, ":").trim().toLowerCase();
/** The catalogue row the IFC's own type name ("Family:Type", Revit's) names, when it is exactly one of the category's (D-B2-1, amendment 13)
 *  and its name, if it states a size, agrees with the measured one (`size` {w, h} or {dia}) within SIZE_BAND_MM: a name alone never types against the element. */
const exactRow = (catalog, category, ifcName, same, size) => {
  const want = sameName(ifcName);
  if (!want.includes(":")) return null;
  const rows = (catalog?.types ?? []).filter((t) => t && same(t, category) && sameName(`${t.family}:${t.type}`) === want);
  if (rows.length !== 1) return null;
  const s = sectionOf(rows[0].type), d = diameterOf(rows[0].type);
  const off = size.dia != null ? d != null && Math.abs(d - size.dia) > SIZE_BAND_MM : s != null && (Math.abs(s[0] - size.w) > SIZE_BAND_MM || Math.abs(s[1] - size.h) > SIZE_BAND_MM);
  return off ? null : rows[0];
};

/** → {storeys: [{storey, body | null, byCid, exceptions, once}], groups, already_filed}, planSurvey's shape. `job` {id, ledger: {id}, reader,
 *  version, provider?}; `notRead` the receipt's list [{global_id, ifc_class, storey, why}]; `catalog` {types, label, sha256} and `sameCategory`
 *  (as planSurvey's) type a door, window or column no office rule types; `hint` the receipt's (true_north). Throws 400/413 in words; writes nothing. */
export function planIfc({ job, candidates, frame, levels: named = {}, manifest = [], type, filed = { cids: new Set(), storeys: new Map() }, notRead = [],
  catalog = { types: [] }, sameCategory = (t, cat) => String(t?.category ?? "").toLowerCase() === String(cat).toLowerCase(), hint = null }) {
  const M = toModel(frame);
  const far = placeRefusal(candidates, frame);
  if (far) throw err(400, `${far} — nothing was saved`);
  const ref = `${job.id} (ledger #${job.ledger.id})`;
  const gaps = [];
  let already = 0;
  const again = (c) => { if (!filed.cids.has(c.cid)) return false; already++; return true; };
  const tn = Array.isArray(hint?.true_north) && hint.true_north.length === 2 && hint.true_north.every(Number.isFinite) && Math.hypot(...hint.true_north) > 1e-9 ? hint.true_north : null;
  // only a storey that holds a wall or floor is matched: Revit exports every Building Story level, and two empty ones at one height would
  // otherwise both match a published level and refuse the whole proposal (their not_read entries are said on `off_storey`)
  const used = new Set(candidates.filter((c) => c.kind !== "level").map((c) => c.geometry?.storey));
  const all = matchStoreys(candidates.filter((c) => c.kind === "level" && used.has(c.cid)), frame, named, manifest, job.id, filed.storeys, (c) => `IFC ${c.cid} ${job.id}`);
  const storeys = all.map((s) => {
    const E = s.elevation_mm, elements = [], byCid = new Map(), exceptions = [];
    const mine = candidates.filter((c) => c.kind !== "level" && c.geometry?.storey === s.cid);
    const trust = (c) => ({ measured: c.measured, accuracy: { status: "inferred", basis: "ifc", from_job: job.id }, pretick: false });
    const hold = (c, why) => exceptions.push({ unique_id: c.cid.slice(0, 64), name: `${c.kind} ${c.cid}`.slice(0, 256), reason: why.slice(0, 300) });
    const gap = (c, g, why = null) => {
      gaps.push({ ...g, size: g.size ?? (g.want ? null : NOT_MEASURED), label: `${s.level} · ${c.cid}`.slice(0, 256), evidence: c.evidence });
      hold(c, `type gap — ${why ?? (g.want ? `${g.want} is not in the type catalogue` : `no office rule types it (${g.key})`)}; it waits in the Holding Area`);
    };
    // a base or top off its storey's level is a person's call, never a guess
    const off = (c, z, what) => {
      const d = Math.round((z - s.scan_mm) * 10) / 10;
      if (Math.abs(d) <= LEVEL_MM) return false;
      hold(c, `its ${what} sits ${d} mm off ${s.level} — a person decides`);
      return true;
    };
    // the executor refuses a point whose z is off its level's height (and declines the storey); a level named but in no published model was never checked (survey-plan :337)
    const unchecked = `its level ${s.level} is in no published model, so its height in Revit is unknown here — Revit refuses a point off its level's height; name a published level, or leave the storey out of levels to have it created`;
    const walls = mine.filter((c) => c.kind === "wall");
    const basic = walls.filter((c) => !c.geometry.curtain);   // a curtain wall is no barrier to wall-location, and has no thickness
    const segs = basic.map((c) => ({ x0: c.geometry.LocationCurve.start[0], y0: c.geometry.LocationCurve.start[1], x1: c.geometry.LocationCurve.end[0], y1: c.geometry.LocationCurve.end[1], width: c.measured.thickness_mm }));
    const centre = [0, 1].map((k) => (walls.length ? walls.reduce((m, c) => m + (c.geometry.LocationCurve.start[k] + c.geometry.LocationCurve.end[k]) / 2, 0) / walls.length : 0));
    // Every wall's facts and gap first, so an opening can see its host's (survey-plan :299). A curtain wall's answer is a curtain type or no answer.
    const typed = walls.map((c) => {
      const g = c.geometry;
      if (g.curtain) {
        const L = g.LocationCurve, ext = g.is_external;
        const loc = ext === true ? { location: "Exterior", why: null } : ext === false ? { location: "Interior", why: null }
          : locate([...segs, { x0: L.start[0], y0: L.start[1], x1: L.end[0], y1: L.end[1], width: 100 }], segs.length);
        // the outside is told by which side of the storey's walls' middle the wall lies; on that middle (a lone curtain wall, a symmetric storey) it is a guess
        const wl = Math.hypot(L.end[0] - L.start[0], L.end[1] - L.start[1]) || 1;
        const across = Math.abs(-(L.end[1] - L.start[1]) * ((L.start[0] + L.end[0]) / 2 - centre[0]) + (L.end[0] - L.start[0]) * ((L.start[1] + L.end[1]) / 2 - centre[1])) / wl;
        const unsure = loc.location === "Exterior" && across < FACADE_MIN_MM;
        const facade = loc.location === "Exterior" && !unsure ? facadeOf(L.start, L.end, centre, tn ?? [0, 1]) : null;
        const facts = { params: { ...(loc.location ? { Location: loc.location } : {}), ...(facade ? { Facade: facade } : {}) } };
        let ans = null, why = null;
        try { ans = type("wall", facts, c.cid, s.level); } catch (e) { if (!e.gap) throw e; why = e.gap.key; }
        return { curtain: true, facts, loc, facade, unsure, ans, why };
      }
      const i = basic.indexOf(c);
      const loc = g.is_external === true ? { location: "Exterior", why: null } : g.is_external === false ? { location: "Interior", why: null } : locate(segs, i);
      const facts = { thickness_mm: c.measured.thickness_mm, ...(loc.location ? { params: { Location: loc.location } } : {}) };
      return { facts, loc, gap: gapOf(type, "wall", facts, c.cid, loc.why, s.level) };
    });
    const lines = new Map(), curtains = [], floors = new Map();   // the walls, curtain walls and floors this storey holds in the model (filed now or before), in the model's frame
    const lineOf = (c) => ({ s: M.xy(c.geometry.LocationCurve.start), e: M.xy(c.geometry.LocationCurve.end), top: M.z(c.geometry.TopElevation) });
    walls.forEach((c, i) => {
      const t = typed[i], g = c.geometry, ext = g.is_external;
      if (again(c)) { if (t.curtain) curtains.push(lineOf(c)); else lines.set(c.cid, lineOf(c)); return; }   // in the model already: it still hosts, or is in the way
      if (t.curtain) {
        if (t.unsure) { hold(c, `IfcCurtainWall ${c.cid}: its outside cannot be told from the storey's walls — a person decides`); return; }
        const said = Object.entries(t.facts.params).map(([k, v]) => `${k} ${v}`).join(", ") || "no facts";
        if (!t.ans) { hold(c, `IfcCurtainWall ${c.cid}: no office rule types a wall with ${said}${t.why ? ` (${t.why})` : ""} — a person decides`); return; }
        if (!/^curtain wall$/i.test(t.ans.FamilyName)) { hold(c, `IfcCurtainWall ${c.cid}: the office's rules answer a basic wall (${t.ans.TypeName}) for ${said} — no facade rule names a curtain type for it; a person decides`); return; }
        if (off(c, g.BaseElevation, "base")) return;
        const L = g.LocationCurve;
        elements.push({ op: "create", kind: "wall", cid: c.cid, evidence: c.evidence, facts: t.facts, validate: { identity: { Class: CREATE_ENTITY.wall, Name: c.cid } },
          place: { LevelName: s.level, LocationCurve: { start: [...M.xy(L.start), E], end: [...M.xy(L.end), E] }, TopElevation: M.z(g.TopElevation) },
          reason: (`IFC curtain wall ${c.cid} "${g.name}": ${c.measured.height_mm} mm high, ${c.measured.length_mm} mm long as modelled (${g.from === "axis" ? "its Axis" : "the line through its parts"}) · ${said}` +
            `${t.facade ? ` (Facade read against True North ${tn ? `[${tn.join(", ")}] of the IFC` : "+Y: the IFC states none"})` : ""} · typed ${t.ans.FamilyName} : ${t.ans.TypeName} · ${ref}`).slice(0, 500) });
        byCid.set(c.cid, trust(c));
        curtains.push(lineOf(c));
        return;
      }
      const { facts, loc, gap: gp } = t;
      if (gp) { gap(c, gp); return; }
      if (off(c, g.BaseElevation, "base")) return;
      const L = g.LocationCurve;
      elements.push({ op: "create", kind: "wall", cid: c.cid, evidence: c.evidence, facts, validate: { identity: { Class: CREATE_ENTITY.wall, Name: c.cid } },
        place: { LevelName: s.level, LocationCurve: { start: [...M.xy(L.start), E], end: [...M.xy(L.end), E] }, TopElevation: M.z(g.TopElevation) },
        reason: (`IFC wall ${c.cid} "${g.name}": ${c.measured.thickness_mm} mm thick (${FROM[g.thickness_from] ?? g.thickness_from}), ${c.measured.height_mm} mm high${g.clipped ? " (before its clip)" : ""}, ` +
          `${c.measured.length_mm} mm long as modelled · Location ${loc.location} (${ext == null ? "read from the storey's walls" : "IsExternal"})${g.note ? ` · ${g.note}` : ""} · ${ref}`).slice(0, 500) });
      byCid.set(c.cid, trust(c));
      lines.set(c.cid, lineOf(c));
    });
    for (const c of mine.filter((x) => x.kind === "floor")) {
      if (again(c)) { floors.set(c.cid, c.geometry.LocationLoop.map((p) => M.xy(p))); continue; }
      const badLoop = outlineProblem(c.geometry.LocationLoop.map((p) => M.xy(p)));
      if (badLoop) { hold(c, `its outline ${badLoop} — a person decides`); continue; }
      const facts = { thickness_mm: c.measured.thickness_mm, params: { Function: c.geometry.is_external ? "Exterior" : "Interior" } }; // the BDS floor rule's key
      const gp = gapOf(type, "floor", facts, c.cid, null, s.level);
      if (gp) { gap(c, gp); continue; }
      if (off(c, c.geometry.TopElevation, "top")) continue;
      elements.push({ op: "create", kind: "floor", cid: c.cid, evidence: c.evidence, facts, validate: { identity: { Class: CREATE_ENTITY.floor, Name: c.cid } },
        place: { LevelName: s.level, LocationLoop: c.geometry.LocationLoop.map((p) => [...M.xy(p), E]) },
        reason: `IFC floor ${c.cid} "${c.geometry.name}": ${c.measured.thickness_mm} mm thick, ${c.measured.area_m2} m² as modelled · ${ref}`.slice(0, 500) });
      byCid.set(c.cid, trust(c));
      floors.set(c.cid, c.geometry.LocationLoop.map((p) => M.xy(p)));
    }

    // MA-8-4: the one wall under a point of this storey, as the executor finds it — held, in words, when the storey's level is unknown, a curtain
    // wall is in the way, or not exactly one basic wall passes (V5). → {line, why}
    const hostAt = (c, host, p) => {
      if (!s.checked) return { why: unchecked };
      const hi = walls.findIndex((w) => w.cid === host && !w.geometry.curtain);
      if (hi < 0) return { why: `its host wall ${host} is not a wall of ${s.level} in ${job.id}` };
      const t = typed[hi];
      if (t.gap && !filed.cids.has(host)) return { why: `its host wall ${host} is a type gap — propose the job again once the wall's group in the Holding Area closes` };
      if (!lines.has(host)) return { why: `its host wall ${host} is held for a person (see its exception), so nothing is cut or placed in it` };
      if (curtains.some((l) => dist(l.s, l.e, p) <= HOST_TOL_MM)) return { why: "a curtain wall passes its point — Revit hosts in one basic wall" };
      const near = [...lines].filter(([, l]) => dist(l.s, l.e, p) <= HOST_TOL_MM);
      if (near.length !== 1) return { why: `${near.length} walls of ${s.level} pass its point (a junction or a layered wall) — Revit hosts in one; a person decides${near.length ? "" : " (none does)"}. A wall already in the Revit model that the bridge cannot see still makes Apply refuse in words` };
      return { line: near[0][1], id: near[0][0] };
    };
    // the typing record of a door, window or column typed from the catalogue (never "caller"): by the file's own type name, else by size
    const typing = (by, via, size, ifcName) => ({ typing: { typed_by: via === "ifc-type" ? "bridge-ifc-type" : "bridge-size", type: by.type, family: by.family, size,
      ...(via === "ifc-type" ? { ifc_type_name: ifcName } : { band_mm: SIZE_BAND_MM }), catalog: catalog.label ?? null, catalog_sha256: catalog.sha256 ?? null } });
    const wordsOf = (by, via, ifcName) => (by ? `typed ${via === "ifc-type" ? `by the IFC's own type name "${ifcName}"` : "by size from the catalogue"}: ${by.family} : ${by.type}` : "typed by an office rule");

    // wall openings (UNTYPED): a rectangle on the one wall under its middle, inside that wall's ends, base and top
    for (const c of mine.filter((x) => x.kind === "opening" && x.geometry.host_kind === "wall")) {
      if (again(c)) continue;
      const g = c.geometry, m = c.measured, host = walls.find((w) => w.cid === g.host && !w.geometry.curtain);
      if (!s.checked) { hold(c, unchecked); continue; }
      if (!host) { hold(c, `its host wall ${g.host} is not a wall of ${s.level} in ${job.id}`); continue; }
      if (!(m.width_mm > 50 && m.width_mm <= 20000 && m.height_mm > 50 && m.height_mm <= 20000 && m.sill_mm >= 0 && m.sill_mm <= 20000)) {
        hold(c, `a ${m.width_mm} x ${m.height_mm} mm cut at sill ${m.sill_mm} mm — an opening is over 50 and at most 20000 mm each way, from a sill of 0 up; a person decides`);
        continue;
      }
      const U = host.geometry.LocationCurve, p = M.xy(pointAlong(U.start, U.end, g.along_mm));
      const at = hostAt(c, g.host, p);
      if (!at.line) { hold(c, at.why); continue; }
      const len = Math.hypot(at.line.e[0] - at.line.s[0], at.line.e[1] - at.line.s[1]), t = ((p[0] - at.line.s[0]) * (at.line.e[0] - at.line.s[0]) + (p[1] - at.line.s[1]) * (at.line.e[1] - at.line.s[1])) / len;
      if (t - m.width_mm / 2 < -HOST_TOL_MM || t + m.width_mm / 2 > len + HOST_TOL_MM) { hold(c, `its ${m.width_mm} mm width, centred ${r1(t)} mm along ${at.id}, runs past an end of that wall (${r1(len)} mm long) — Sentinel cuts one wall; a person decides`); continue; }
      if (E + m.sill_mm + m.height_mm > at.line.top + HOST_TOL_MM) { hold(c, `it runs from ${r1(E + m.sill_mm)} to ${r1(E + m.sill_mm + m.height_mm)} mm, past ${at.id}'s bottom (${r1(E)} mm) or top (${r1(at.line.top)} mm) — Sentinel cuts one wall; a person decides`); continue; }
      elements.push({ op: "create", kind: "opening", cid: c.cid, evidence: c.evidence, validate: { identity: { Class: CREATE_ENTITY.opening, Name: c.cid } },
        place: { LevelName: s.level, Location: [...p, E], Width: m.width_mm, Height: m.height_mm, SillHeight: m.sill_mm },
        reason: `IFC opening ${c.cid} in ${g.host}: ${m.width_mm} wide, ${m.height_mm} high, sill ${m.sill_mm} mm as modelled · ${ref}`.slice(0, 500) });
      byCid.set(c.cid, trust(c));
    }
    // floor openings (UNTYPED): the outline's centre and every corner lie in the host floor, and the centre in no other floor
    for (const c of mine.filter((x) => x.kind === "opening" && x.geometry.host_kind === "floor")) {
      if (again(c)) continue;
      const g = c.geometry, B = g.Boundary.map((q) => M.xy(q)), mid = [0, 1].map((k) => B.reduce((sum, q) => sum + q[k], 0) / B.length), host = floors.get(g.host);
      const bad = outlineProblem(B);
      if (bad) { hold(c, `its outline ${bad} — a person cuts the hole`); continue; }
      if (!host) { hold(c, `its host floor ${g.host} is not filed on ${s.level} (a type gap, held, or not read) — a person cuts the hole`); continue; }
      if (!inLoop(mid, host) || !B.every((q) => inLoop(q, host))) { hold(c, `its outline is not inside its host floor ${g.host} — Revit cuts one floor; a person decides`); continue; }
      if ([...floors.values()].filter((l) => inLoop(mid, l)).length !== 1) { hold(c, `its centre lies in more than one floor of ${s.level} — Revit cuts one floor; a person decides`); continue; }
      elements.push({ op: "create", kind: "opening", cid: c.cid, evidence: c.evidence, validate: { identity: { Class: CREATE_ENTITY.opening, Name: c.cid } },
        place: { LevelName: s.level, Boundary: B },
        reason: `IFC hole ${c.cid} in floor ${g.host}: ${c.measured.area_m2} m² as modelled · ${ref}`.slice(0, 500) });
      byCid.set(c.cid, trust(c));
    }

    // doors and windows: typed by an office rule, else the IFC's own Family:Type when the catalogue holds exactly that row, else by size (within 100 mm), else a gap
    for (const c of mine.filter((x) => x.kind === "door" || x.kind === "window")) {
      if (again(c)) continue;
      const g = c.geometry, m = c.measured, host = walls.find((w) => w.cid === g.host && !w.geometry.curtain);
      if (!s.checked) { hold(c, unchecked); continue; }
      if (!host) { hold(c, `its host wall ${g.host} is not a wall of ${s.level} in ${job.id}`); continue; }
      if (c.kind === "door" && Math.abs(m.sill_mm) > LEVEL_MM) { hold(c, `a door whose bottom sits ${m.sill_mm} mm above its level — a person decides`); continue; }
      if (c.kind === "window" && !(m.sill_mm >= -LEVEL_MM && m.sill_mm <= 20000)) { hold(c, `a window whose sill is ${m.sill_mm} mm from its level — a person decides`); continue; }
      const U = host.geometry.LocationCurve, p = M.xy(pointAlong(U.start, U.end, g.along_mm));
      const at = hostAt(c, g.host, p);
      if (!at.line) { hold(c, at.why); continue; }
      const w = nominal(m.width_mm), h = nominal(m.height_mm), size = `${w} x ${h} mm`, hi = walls.indexOf(host);
      const { facts, g: gp, by, why, via } = typeOpening({ type, kind: c.kind, cid: c.cid, w, h, hostFunction: typed[hi].loc?.location, catalog, sameCategory, level: s.level,
        exact: () => exactRow(catalog, KIND_CATEGORY[c.kind], g.ifc_type_name, sameCategory, { w, h }) });
      if (gp) { gap(c, gp, why); continue; }
      elements.push({ op: "create", kind: c.kind, cid: c.cid, evidence: c.evidence, facts, validate: { identity: { Class: CREATE_ENTITY[c.kind], Name: c.cid } },
        place: { LevelName: s.level, Location: [...p, E], ...(by ? { FamilyName: by.family, TypeName: by.type } : {}), ...(c.kind === "window" ? { SillHeight: Math.max(0, m.sill_mm) } : {}) },
        reason: (`IFC ${c.kind} ${c.cid} "${g.name}" in ${g.host}: ${m.width_mm} wide, ${m.height_mm} high${c.kind === "window" ? `, sill ${m.sill_mm}` : ""} mm as modelled (${size} nominal) · ${wordsOf(by, via, g.ifc_type_name)} · ` +
          `its hand and facing are not read from the IFC — check the swing in Revit · ${ref}`).slice(0, 500) });
      byCid.set(c.cid, { ...trust(c), ...(by ? typing(by, via, size, g.ifc_type_name) : {}) });
    }

    // columns: architectural only, square to the model, to a matched level or held (D-B2-2, D-B2-3); typed as a door is, a circle by its diameter
    for (const c of mine.filter((x) => x.kind === "column")) {
      if (again(c)) continue;
      const g = c.geometry, m = c.measured, round = g.shape === "circle";
      if (!s.checked) { hold(c, unchecked); continue; }
      if (g.load_bearing === true) { hold(c, "a structural column — structural columns are not placed from an IFC yet; a person places it"); continue; }
      if (off(c, g.base_mm, "base")) continue;
      const topAt = all.filter((x) => x.cid !== s.cid && x.scan_mm > s.scan_mm + LEVEL_MM && Math.abs(x.scan_mm - g.top_mm) <= LEVEL_MM)[0];
      if (!topAt) { hold(c, `its top is at ${g.top_mm} mm, at no level of this IFC's matched storeys — a person decides`); continue; }
      if (topAt.how === "created") { hold(c, `its top level ${topAt.level} is created by that storey's changeset — apply it, then propose again`); continue; }
      let wd = m.width_mm, dp = m.depth_mm;
      if (!round) {
        const turn = (((g.rotation_deg + frame.rotation_deg) % 90) + 90) % 90;
        if (Math.min(turn, 90 - turn) > 0.5) { hold(c, `a column turned ${r1(turn > 45 ? turn - 90 : turn)}° — Sentinel places columns square to the model (no Rotation for a column); a person decides`); continue; }
        if (Math.round(((g.rotation_deg + frame.rotation_deg) % 360) / 90) % 2 === 1) [wd, dp] = [dp, wd];   // a quarter turn: the footprint's X is the model's Y
      }
      const category = KIND_CATEGORY.column, size = round ? `D${Math.round(m.diameter_mm)} mm` : `${Math.round(wd)} x ${Math.round(dp)} mm`;
      const { facts, g: gp, by, why, via } = typeOpening({ type, kind: "column", cid: c.cid, w: Math.round(wd), h: Math.round(dp), catalog, sameCategory, level: s.level,
        exact: () => exactRow(catalog, category, g.ifc_type_name, sameCategory, round ? { dia: m.diameter_mm } : { w: wd, h: dp }),
        ...(round ? { round: Math.round(m.diameter_mm), find: () => typeByDiameter(catalog, category, m.diameter_mm, sameCategory) } : { find: () => typeBySize(catalog, category, wd, dp, sameCategory) }) });
      if (gp) { gap(c, gp, why); continue; }
      elements.push({ op: "create", kind: "column", cid: c.cid, evidence: c.evidence, facts, validate: { identity: { Class: CREATE_ENTITY.column, Name: c.cid } },
        place: { LevelName: s.level, Location: [...M.xy(g.Location), E], TopLevel: topAt.level, ...(by ? { FamilyName: by.family, TypeName: by.type } : {}) },
        reason: (`IFC column ${c.cid} "${g.name}": ${size} (${round ? "round" : "width x depth"}) at (${g.Location.join(", ")}), ${r1(g.top_mm - g.base_mm)} mm tall to ${topAt.level} · ` +
          `${g.load_bearing === false ? "LoadBearing false" : "LoadBearing not stated — read as architectural"} · ${wordsOf(by, via, g.ifc_type_name)}${topAt.how === "filed" ? ` · its top level ${topAt.level} comes with that storey's changeset: apply it first` : ""}${g.note ? ` · ${g.note}` : ""} · ${ref}`).slice(0, 500) });
      byCid.set(c.cid, { ...trust(c), ...(by ? typing(by, via, size, g.ifc_type_name) : {}) });
    }
    // what was not read: one exception per IFC class on the storey (a 64 MB file can hold thousands), the first GlobalIds named
    for (const [cls, list] of byClass(notRead.filter((x) => x.storey === s.cid)))
      exceptions.push({ unique_id: `${cls}@${s.cid}`.slice(0, 64), name: nameOf(list), reason: reasonOf(list) });
    if (!elements.length) return { storey: s, body: null, byCid, exceptions, once: [] };
    if (s.how === "created") {
      const lv = candidates.find((c) => c.cid === s.cid);
      elements.unshift({ op: "create", kind: "level", cid: s.cid, evidence: lv.evidence, validate: { identity: { Class: "IFCBUILDINGSTOREY", Name: s.level } },
        place: { BaseElevation: E, Name: s.level }, reason: `IFC storey ${s.cid} "${lv.geometry.name}" at ${s.scan_mm} mm · a new level at ${E} mm in the model · ${ref}`.slice(0, 500) });
      byCid.set(s.cid, trust(lv));
    }
    if (elements.length > MAX_CHANGESET_ELEMENTS)
      throw err(413, `${s.cid} would file ${elements.length} elements on ${s.level} — over the ${MAX_CHANGESET_ELEMENTS} one changeset (one Undo) holds; a storey is not split into changesets yet — export a part of the concept — nothing was saved`);
    // MA-8-3: a vendor's IFC says whose in the changeset's name
    return { storey: s, byCid, exceptions, once: [], body: { name: `IFC${job.provider && job.provider !== "own" ? ` (${job.provider})` : ""} ${job.id} · ${s.level}`, contract: 2, source: `${job.reader} ${job.version}`, elements, exceptions } };
  });
  // MA-6-8 review: what the reader left out that no matched storey carries (no storey, or a storey with nothing to place) — one row a class
  const on = new Set(storeys.map((s) => s.storey.cid));
  const off_storey = [...byClass(notRead.filter((x) => !on.has(x.storey)))].map(([cls, list]) => ({ ifc_class: cls, count: list.length, name: nameOf(list), reason: reasonOf(list) }));
  return { storeys, groups: groupGaps(gaps), already_filed: already, off_storey };
}
