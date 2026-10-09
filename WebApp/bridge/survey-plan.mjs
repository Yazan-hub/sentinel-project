// MA-4d — survey candidates to changesets, the pure half (design §6.3, §6.6, §6.7; plan docs/superpowers/plans/2026-10-08-ma4d-survey-to-changesets.md).
// A done sentinel-survey job whose result the bridge trusts (build-jobs trustedJob: MA-4c decision 11) becomes, per storey, ONE changeset of
// creates the bridge builds itself from result.json — never a body's geometry or measurement. The lead states two things: where the scan
// sits in the model (frame) and, optionally, which existing level a storey is (levels). Walls are trimmed to their corners, read inside or
// outside (wall-location.mjs, the office's own rule) and typed exactly (D16) by the project's typer; a candidate that does not type is a
// gap — grouped for the Holding Area and listed on its storey's changeset as an exception. Pure and deterministic: the same job, frame,
// levels, published levels and standards give the same bodies (the proposal_guids are validateChangeset's).
import { MAX_CHANGESET_ELEMENTS } from "./changesets-logic.mjs";
import { KIND_ENTITY } from "./changesets-typing.mjs";
import { typeGapId } from "./holding-logic.mjs";
import { locate } from "./wall-location.mjs";

const err = (status, message) => Object.assign(new Error(message), { status });
const bad = (m) => err(400, `${m} — nothing was saved`);
export const PLANNER = "survey-planner";
export const PLANNER_VERSION = "0.1.0";
/** D7: the pre-tick tolerance (on the fit) and the level match's.
 *  ponytail: one constant for both, and MA-4e's p95 verdict (judge); a per-class tolerance (lod_matrix or the contract's) is MA-8's. */
export const TOLERANCE_MM = 20;
export const NOT_MEASURED = "thickness not measured";
const MAX_XY_MM = 10_000_000; // 10 km: a scan farther from the internal origin is in a national grid — its CRS is read from MA-4g
const MAX_Z_MM = 100_000;
const FRAME = ["dx_mm", "dy_mm", "dz_mm", "rotation_deg"];
const REVIT_BAD = /[\\:{}[\]|;<>?`~\u0000-\u001f]/; // what Revit refuses in a name
const r1 = (v) => Math.round(v * 10) / 10 || 0; // 0.1 mm, never -0

/** POST …/propose's body → {frame, levels}, or a 400 in words. `levelCids`: the job's storeys. Only the lead's two statements are read;
 *  anything else (a geometry, a measurement, a trust field, a job id) is refused, never dropped — the bridge builds the rest. */
export function readProposeBody(b, levelCids) {
  if (!b || typeof b !== "object" || Array.isArray(b)) throw bad("the body is {frame, levels?}");
  for (const k of Object.keys(b))
    if (k !== "frame" && k !== "levels") throw bad(`${k.slice(0, 64)} is not a proposal field — the bridge builds every changeset from the job's own result; send {frame, levels?}`);
  const f = b.frame;
  if (!f || typeof f !== "object" || Array.isArray(f))
    throw bad("frame is required — where the scan sits in the model: {dx_mm, dy_mm, dz_mm, rotation_deg}, the move and turn from the model's internal origin to the scan's origin ({0, 0, 0, 0} when the scan is registered to the internal origin)");
  for (const k of Object.keys(f)) if (!FRAME.includes(k)) throw bad(`frame.${k.slice(0, 64)} is not read — a frame is {dx_mm, dy_mm, dz_mm, rotation_deg}`);
  for (const [k, max] of [["dx_mm", MAX_XY_MM], ["dy_mm", MAX_XY_MM], ["dz_mm", MAX_Z_MM]])
    if (!Number.isFinite(f[k]) || Math.abs(f[k]) > max) throw bad(`frame.${k} must be a number of mm within ±${max} (a scan in a national grid is read with its CRS from MA-4g)`);
  if (!Number.isFinite(f.rotation_deg) || f.rotation_deg < 0 || f.rotation_deg >= 360)
    throw bad("frame.rotation_deg must be degrees from 0 up to (not including) 360, anticlockwise in plan");
  const levels = {}, used = new Map();
  if (b.levels != null) {
    if (typeof b.levels !== "object" || Array.isArray(b.levels)) throw bad('levels is {"<storey cid>": "<an existing Revit level\'s name>"}');
    for (const [cid, name] of Object.entries(b.levels)) {
      if (!levelCids.includes(cid)) throw bad(`levels names ${cid.slice(0, 64)}, which is not a storey of this job (${levelCids.join(", ")})`);
      if (typeof name !== "string" || !name.trim() || name.length > 256 || REVIT_BAD.test(name))
        throw bad(`levels.${cid} must be a Revit level's name — one line of at most 256 characters, without \\ : { } [ ] | ; < > ? \` ~`);
      const k = name.trim().toLowerCase();
      if (used.has(k)) throw bad(`levels names ${name.trim()} for both ${used.get(k)} and ${cid} — a level is one storey`);
      used.set(k, cid);
      levels[cid] = name.trim();
    }
  }
  return { frame: { dx_mm: f.dx_mm, dy_mm: f.dy_mm, dz_mm: f.dz_mm, rotation_deg: f.rotation_deg }, levels };
}

/** The lead's frame as a point map, scan mm → model (Revit internal) mm: turned anticlockwise about the scan's origin, then moved.
 *  ponytail: the lead's stated frame, unmeasured and outside D7's 20 mm; MA-4g computes it (scan CRS + IfcMapConversion or a registration
 *  report's rmse, then counted in the tolerance); a project frame artefact when jobs share one. */
export function toModel(f) {
  const a = (f.rotation_deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return { xy: ([x, y]) => [r1(c * x - s * y + f.dx_mm), r1(s * x + c * y + f.dy_mm)], z: (z) => r1(z + f.dz_mm) };
}

/** MA-4e: the lead's frame backwards — model (Revit internal) mm → the scan's mm: moved back, then turned back (toModel's inverse). Only the
 *  four frame keys are read (the stored frame also carries stated_by).
 *  ponytail: one statement both ways — a measure as filed cannot see a wrong frame; MA-4g computes it. */
export function toScan(f) {
  const a = (f.rotation_deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return { xy: ([x, y]) => { const X = x - f.dx_mm, Y = y - f.dy_mm; return [r1(c * X + s * Y), r1(c * Y - s * X)]; }, z: (z) => r1(z - f.dz_mm) };
}

/** Each storey's level in the model, lowest first: the one the lead named (its height checked when a published IFC holds the name); else the
 *  ONE level name of the published IFCs within TOLERANCE_MM of the storey's height in the model's frame; else a new level the changeset
 *  creates there, `Scan <Lnn> <job-id>`. `manifest`: [{name, elevation_mm, from}]. → [{cid, scan_mm, level, how, elevation_mm, delta_mm,
 *  checked, from}] or a 400 in words. `filedStoreys` (decision 19): cid → the storey record of a changeset this job already filed — that
 *  storey keeps its level (`how: "filed"`, checked as recorded), so a created level is never created twice.
 *  ponytail: a published storey Elevation is taken in Revit's internal frame (an IFC exported from another base is off by its height: `from`
 *  names the model, and the lead's names win); MA-4g reads the shared coordinates.
 *  ponytail: a created level whose changeset is still proposed is not created again — apply that storey's first changeset first.
 *  ponytail: a created level's name is unique per job id, not per row — a jobs folder deleted reuses job ids (decision 19), and a name already
 *  in the Revit model makes the executor's lvl.Name throw, rolling the storey's changeset back in Revit's words (fails safe); the upgrade is to
 *  name it from the row (`Scan L01 job-0002 #2201`) — the controller's call, the name is pinned in Tasks 5, 7 and 11 and the drill rows. */
export function matchStoreys(levelCands, frame, named, manifest, jobId, filedStoreys = new Map()) {
  const M = toModel(frame);
  const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const out = [...levelCands].sort((a, b) => a.geometry.BaseElevation - b.geometry.BaseElevation).map((c) => {
    const z = M.z(c.geometry.BaseElevation), base = { cid: c.cid, scan_mm: c.geometry.BaseElevation };
    const name = named[c.cid];
    const was = filedStoreys.get(c.cid);
    if (was) {
      if (name && !same(name, was.level)) throw bad(`${c.cid} was filed on ${was.level} — leave it out of levels, or run the survey again to propose it afresh`);
      return { ...base, level: was.level, how: "filed", elevation_mm: was.elevation_mm, delta_mm: was.delta_mm, checked: was.checked, from: was.from };
    }
    if (name) {
      const hit = manifest.find((l) => same(l.name, name));
      if (!hit) return { ...base, level: name, how: "named", elevation_mm: z, delta_mm: null, checked: false, from: null };
      const d = r1(hit.elevation_mm - z);
      if (Math.abs(d) > TOLERANCE_MM)
        throw bad(`${hit.name} is at ${hit.elevation_mm} mm in ${hit.from} and the scan's storey ${c.cid} at ${z} mm in the model's frame — ${Math.abs(d)} mm apart, more than the ${TOLERANCE_MM} mm a match allows (D7); name the level at that height, or leave the storey out of levels to have it created`);
      return { ...base, level: hit.name, how: "named", elevation_mm: hit.elevation_mm, delta_mm: d, checked: true, from: hit.from };
    }
    const near = manifest.filter((l) => Math.abs(l.elevation_mm - z) <= TOLERANCE_MM);
    const names = [...new Set(near.map((l) => l.name))];
    if (names.length > 1) throw bad(`the published models have ${names.join(" and ")} within ${TOLERANCE_MM} mm of the scan's storey ${c.cid} (${z} mm in the model's frame) — name one in levels`);
    if (names.length === 1) return { ...base, level: near[0].name, how: "matched", elevation_mm: near[0].elevation_mm, delta_mm: r1(near[0].elevation_mm - z), checked: true, from: near[0].from };
    return { ...base, level: `Scan ${/L\d+/.exec(c.cid)?.[0] ?? c.cid} ${jobId}`, how: "created", elevation_mm: z, delta_mm: 0, checked: true, from: null };
  });
  const seen = new Map();
  for (const s of out) {
    const k = s.level.toLowerCase();
    if (seen.has(k)) throw bad(`the storeys ${seen.get(k)} and ${s.cid} would both be ${s.level} — name each in levels`);
    seen.set(k, s.cid);
  }
  return out;
}

/** Wall ends moved to the corners, in the scan's frame: an end of a paired wall goes along its own line to where it meets the nearest
 *  non-parallel (≥ 10°) paired wall's centreline, when that point is within that wall's thickness + 50 mm of the end and on that wall
 *  (extended by this wall's thickness + 50 mm). The survey's centreline runs face a's full length (pipeline.py:303-306: up to half a
 *  thickness long or short at a corner, plus the fit); ends that meet are joined by Revit within one changeset. The lines never move, so
 *  the order does not matter. walls [{start, end, width}] → [{start, end, trim_mm: [start, end], to: [j | null, j | null]}] (+ = longer;
 *  `to`: the wall each end was trimmed to, an index into walls — a type gap's is named in the reason).
 *  ponytail: end-to-centreline only — a mitre, a wall meeting two at one end, a door gap are Revit's or MA-5's (GHB-6). */
export function trimEnds(walls) {
  const SLACK = 50, SIN_MIN = Math.sin(Math.PI / 18);
  return walls.map((w, i) => {
    const keep = { start: w.start, end: w.end, trim_mm: [0, 0], to: [null, null] };
    if (!(w.width > 0)) return keep;
    const dx = w.end[0] - w.start[0], dy = w.end[1] - w.start[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    const [[t0, j0], [t1, j1]] = [w.start, w.end].map((e) => {
      let best = null, to = null;
      walls.forEach((o, j) => {
        if (j === i || !(o.width > 0)) return;
        const ex = o.end[0] - o.start[0], ey = o.end[1] - o.start[1], el = Math.hypot(ex, ey), den = ux * ey - uy * ex;
        if (Math.abs(den) < SIN_MIN * el) return; // parallel, or nearly
        const rx = o.start[0] - e[0], ry = o.start[1] - e[1];
        const t = (rx * ey - ry * ex) / den, v = (rx * uy - ry * ux) / den, slack = (w.width + SLACK) / el; // e + t·u = o.start + v·(o.end − o.start)
        if (Math.abs(t) > o.width + SLACK || v < -slack || v > 1 + slack) return;
        if (best === null || Math.abs(t) < Math.abs(best)) { best = t; to = j; }
      });
      return [best ?? 0, to];
    });
    if (len - t0 + t1 < 1) return keep;
    const at = (p, t) => [r1(p[0] + t * ux), r1(p[1] + t * uy), p[2]];
    return { start: at(w.start, t0), end: at(w.end, t1), trim_mm: [Math.round(-t0) || 0, Math.round(t1) || 0], to: [j0, j1] };
  });
}

/** MA-4d (review): how far a paired wall's scanned faces sit from the ghost's faces — the untrimmed centreline offset by half the thickness
 *  each side — the largest over the faces' ends, in mm (0.1); null without a centreline, a thickness or faces. The fit's rmse is each face
 *  against its OWN fitted line, and pair() accepts faces up to 5° apart, so a 2 mm fit can hide a face hundreds of mm off the ghost. Read
 *  from result.json's geometry.faces (scan frame), no point cloud.
 *  ponytail: the faces' ends, not their points — a bowed face is MA-4e's deviation against the placed element. */
function faceDev(c) {
  const L = c.geometry?.LocationCurve, t = c.measured?.thickness_mm, F = c.geometry?.faces;
  if (!L || !Number.isFinite(t) || !Array.isArray(F) || !F.length) return null;
  const dx = L.end[0] - L.start[0], dy = L.end[1] - L.start[1], len = Math.hypot(dx, dy);
  let dev = 0;
  for (const f of F) for (const [x, y] of [[f[0], f[1]], [f[2], f[3]]])
    dev = Math.max(dev, Math.abs(Math.abs(dx * (y - L.start[1]) - dy * (x - L.start[0])) / len - t / 2));
  return r1(dev);
}

/** null when the typer types it, else its gap (changesets-typing attaches one to every refusal a candidate can earn); any other fault — no
 *  standards, a code fault — is thrown and refuses the whole proposal in its own words. */
function gapOf(type, kind, facts, cid, why) {
  try { type(kind, facts, cid); return null; } catch (e) {
    if (!e.gap) throw e;
    return { ...e.gap, key: why ? `${e.gap.key}; inside or outside not read: ${why}`.slice(0, 500) : e.gap.key };
  }
}

/** The gaps as the Holding Area's groups: one per category and wanted type, else size (typeGapId — exact sizes, no band while the D16 snap is
 *  0), at most 50 labels and evidence refs, in a fixed order. */
export function groupGaps(gaps) {
  const by = new Map();
  for (const g of gaps) {
    const id = typeGapId(g);
    const x = by.get(id) ?? { id, category: g.category, want: g.want ?? null, size: g.size ?? null, key: g.key ? String(g.key).slice(0, 500) : null,
      elements: 0, labels: [], nearest: (g.nearest ?? []).slice(0, 50), evidence: [] };
    x.elements++;
    if (x.labels.length < 50) x.labels.push(g.label);
    for (const e of g.evidence) if (x.evidence.length < 50 && !x.evidence.includes(e)) x.evidence.push(e);
    by.set(id, x);
  }
  if (by.size > 200) throw err(413, `the job leaves ${by.size} type-gap groups — over the 200 one Holding Area row holds; MA-4h splits it — nothing was saved`);
  return [...by.values()];
}

/** The plan of one trusted job → {storeys: [{storey, body | null, byCid, exceptions}], groups, already_filed}. `job` {id, ledger: {id},
 *  reader, version}; `type` the project's typer (the same instance validateChangeset then types with); `manifest` the published levels;
 *  `filed` (decision 19) {cids, storeys}: what this job already filed — not proposed again, but every wall still trims and reads inside or
 *  outside against it. byCid: the bridge's trust record of each element it built — validateChangeset stamps it, never a body. Throws 400/413
 *  in words; writes nothing. */
export function planSurvey({ job, candidates, frame, levels: named = {}, manifest = [], type, filed = { cids: new Set(), storeys: new Map() } }) {
  const M = toModel(frame);
  const ref = `${job.id} (ledger #${job.ledger.id})`;
  const fit = (c) => (Number.isFinite(c.fit?.rmse_mm) ? `fit ${c.fit.rmse_mm} mm rms` : "no fit");
  const gaps = [];
  let already = 0;
  const again = (c) => { if (!filed.cids.has(c.cid)) return false; already++; return true; };
  const storeys = matchStoreys(candidates.filter((c) => c.kind === "level"), frame, named, manifest, job.id, filed.storeys).map((s) => {
    const E = s.elevation_mm, elements = [], byCid = new Map(), exceptions = [];
    const mine = candidates.filter((c) => c.kind !== "level" && c.geometry?.storey === s.cid);
    // The trust record: the job's measured block as stored; the accuracy judged on the fit (each face's inliers against its own line) AND on
    // how far the faces sit from the ghost's (faceDev) — design rule 6's measured verdict, said by `basis`; the pre-tick, the bridge's half of
    // design :753-759 (conflicts and BLOCK are checked in Revit at Apply): within D7's 20 mm, the storey's level height checked, every size
    // its type decides measured.
    // ponytail: the fit and the faces' ends, not deviation — MA-4e's verify:measured adds p95 and coverage against the placed element.
    const trust = (c, extra = {}) => {
      const rms = c.fit?.rmse_mm, dev = c.kind === "wall" ? faceDev(c) : null;
      const status = !Number.isFinite(rms) ? "insufficient_data" : Math.max(rms, dev ?? 0) <= TOLERANCE_MM ? "within_tolerance" : "out_of_tolerance";
      const sized = c.kind === "level" || (c.kind === "wall" && Number.isFinite(c.measured?.thickness_mm));
      return { measured: c.measured, accuracy: { status, basis: "fit", from_job: job.id, fit_rmse_mm: Number.isFinite(rms) ? rms : null, face_dev_mm: dev,
        coverage: c.fit?.coverage ?? null, target_mm: TOLERANCE_MM }, pretick: status === "within_tolerance" && s.checked && sized, ...extra };
    };
    const gap = (c, g) => {
      gaps.push({ ...g, size: g.size ?? (g.want ? null : NOT_MEASURED), label: `${s.level} · ${c.cid}`.slice(0, 256), evidence: c.evidence });
      exceptions.push({ unique_id: c.cid.slice(0, 64), name: `${c.kind} ${c.cid}`.slice(0, 256),
        // a wall of one face seen was never typed: its thickness is missing, not the rule (final review)
        reason: `type gap — ${g.want ? `${g.want} is not in the type catalogue` : c.kind === "wall" && g.size === NOT_MEASURED ? `its thickness was not measured (${g.key})`
          : `no office rule types it (${g.key})`}; it waits in the Holding Area`.slice(0, 300) });
    };
    const walls = mine.filter((c) => c.kind === "wall");
    const trimmed = trimEnds(walls.map((c) => ({ start: c.geometry.LocationCurve.start, end: c.geometry.LocationCurve.end, width: c.measured.thickness_mm ?? 0 })));
    const segs = trimmed.map((t, i) => ({ x0: t.start[0], y0: t.start[1], x1: t.end[0], y1: t.end[1], width: walls[i].measured.thickness_mm ?? 0 }));
    // Every wall's facts and gap first, so a wall trimmed to a gap's centreline can say so (the corner closes once the gap is placed).
    const typed = walls.map((c, i) => {
      const t = c.measured.thickness_mm;
      if (!Number.isFinite(t)) return { gap: { category: "Walls", want: null, size: NOT_MEASURED, key: "one face seen", nearest: [] } };
      const loc = locate(segs, i), facts = { thickness_mm: t, ...(loc.location ? { params: { Location: loc.location } } : {}) };
      return { facts, loc, gap: gapOf(type, "wall", facts, c.cid, loc.why) };
    });
    walls.forEach((c, i) => {
      if (again(c)) return;
      const { facts, loc, gap: g } = typed[i];
      if (g) return gap(c, g);
      const tr = trimmed[i].trim_mm;
      const toGap = trimmed[i].to.map((j, k) => (j != null && typed[j].gap ? `the ${k ? "end" : "start"} to ${walls[j].cid}'s centreline: a type gap, not placed` : null)).filter(Boolean);
      elements.push({ op: "create", kind: "wall", cid: c.cid, evidence: c.evidence, facts, validate: { identity: { Class: KIND_ENTITY.wall, Name: c.cid } },
        place: { LevelName: s.level, LocationCurve: { start: [...M.xy(trimmed[i].start), E], end: [...M.xy(trimmed[i].end), E] }, TopElevation: M.z(c.geometry.TopElevation) },
        reason: (`scan wall ${c.cid}: ${facts.thickness_mm} mm thick, ${c.measured.height_mm} mm high, ${c.measured.length_mm} mm long as measured · ${fit(c)} · ` +
          `${loc.location ? `Location ${loc.location}` : `inside or outside not read (${loc.why})`} · ends ${tr.join(" / ")} mm to the corners` +
          `${toGap.length ? ` (${toGap.join("; ")})` : ""} · ${ref}`).slice(0, 500) });
      byCid.set(c.cid, trust(c, { trim_mm: tr }));
    });
    for (const c of mine.filter((x) => x.kind === "floor" || x.kind === "ceiling")) {
      if (again(c)) continue;
      const g = gapOf(type, c.kind, null, c.cid, null);
      if (g) { gap(c, g); continue; }
      const place = c.kind === "floor"
        ? { LevelName: s.level, LocationLoop: c.geometry.LocationLoop.map((p) => [...M.xy(p), E]) }
        : { LevelName: s.level, Boundary: c.geometry.Boundary.map((p) => M.xy(p)), Offset: r1(M.z(c.measured.elevation_mm) - E) };
      elements.push({ op: "create", kind: c.kind, cid: c.cid, evidence: c.evidence, validate: { identity: { Class: KIND_ENTITY[c.kind], Name: c.cid } }, place,
        reason: `scan ${c.kind} ${c.cid}: ${c.measured.area_m2} m² at ${c.measured.elevation_mm} mm as measured · ${fit(c)} · its thickness is the type's (the scan sees one face) · ${ref}`.slice(0, 500) });
      byCid.set(c.cid, trust(c));
    }
    if (!elements.length) return { storey: s, body: null, byCid, exceptions };
    if (s.how === "created") {
      const lv = candidates.find((c) => c.cid === s.cid);
      elements.unshift({ op: "create", kind: "level", cid: s.cid, evidence: lv.evidence, validate: { identity: { Class: "IFCBUILDINGSTOREY", Name: s.level } },
        place: { BaseElevation: E, Name: s.level }, reason: `scan storey ${s.cid} at ${s.scan_mm} mm (${fit(lv)}) · a new level at ${E} mm in the model · ${ref}`.slice(0, 500) });
      byCid.set(s.cid, trust(lv));
    }
    // ponytail: one changeset (one Undo) per storey; a storey over 200 needs StoreyBatch to accept the survey source (C#) — MA-4h with Kladno.
    if (elements.length > MAX_CHANGESET_ELEMENTS)
      throw err(413, `${s.cid} would file ${elements.length} elements on ${s.level} — over the ${MAX_CHANGESET_ELEMENTS} one changeset (one Undo) holds; splitting a storey waits for MA-4h — nothing was saved`);
    return { storey: s, byCid, exceptions, body: { name: `Survey ${job.id} · ${s.level}`, contract: 2, source: `${job.reader} ${job.version}`, elements, exceptions } };
  });
  return { storeys, groups: groupGaps(gaps), already_filed: already };
}

// ── MA-4e: deviation after placement (design §6.6 verify:measured, §6.9 POST /measure). The service measures; the bridge picks what is measured
//    and judges it (rule 3). ──

/** Rule 6's statuses a measure gives, in the order the words count them. */
export const STATUSES = ["within_tolerance", "out_of_tolerance", "missing", "insufficient_data", "not_measured"];
/** "3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured". Pure. */
export const countWords = (n) => STATUSES.map((s) => `${n[s] ?? 0} ${s.replace(/_/g, " ")}`).join(", ");
/** A measured wall below this share of its faces' interior seen is insufficient_data, never judged.
 *  ponytail: one share for every class (D7 sets none) — a wall seen from one side reads about 0.5 and is judged on that face; the founder
 *  set it for v0.1 (2026-10-09, MA-4e open question 2), MA-4h tunes it on Kladno. */
export const MIN_COVERAGE = 0.25;

/** The faces sentinel-survey measures a placed wall by, as filed: its line, its measured thickness (exact typing, D16: the placed type's width),
 *  its base (the line's z) and its top — the box the executor places (Wall.Create's default location line, Wall Centerline, and the type's
 *  Width equal to facts.thickness_mm: drill MA4e R-1 reads both before this merges — a gate), back in the scan's frame. Each face [p0, p1, p3]
 *  (p1 and p3 the corners next to p0), (p1 − p0) × (p3 − p0) out of the wall: + is the scan outside it. → {faces} or {why}. Pure.
 *  ponytail: the line's box — Revit's joins and a free end are not drawn; the service reads 200 mm in from every edge, so neither is judged. */
export function facesOf(el, S) {
  const p = el.place ?? {}, c = p.LocationCurve, t = el.facts?.thickness_mm;
  if (!Array.isArray(c?.start) || !Array.isArray(c?.end) || !Number.isFinite(c.start[2]) || !(t > 0) || !Number.isFinite(p.TopElevation))
    return { why: "its line, measured thickness or top is not on the changeset" };
  const [ax, ay] = S.xy(c.start), [bx, by] = S.xy(c.end), zb = S.z(c.start[2]), zt = S.z(p.TopElevation);
  const L = Math.hypot(bx - ax, by - ay);
  if (!(L >= 1) || !(zt > zb)) return { why: "its line is shorter than 1 mm, or its top not above its base" };
  const nx = (-(by - ay) / L) * (t / 2), ny = ((bx - ax) / L) * (t / 2);
  const at = (x, y, z) => [r1(x), r1(y), z];
  return { faces: [
    [at(ax + nx, ay + ny, zb), at(ax + nx, ay + ny, zt), at(bx + nx, by + ny, zb)],    // the face on the line's left, out to the left
    [at(ax - nx, ay - ny, zb), at(bx - nx, by - ny, zb), at(ax - nx, ay - ny, zt)]] }; // the face on its right, out to the right
}

/** MA-4f: what a placed wall was measured by — Revit's re-read at Apply (the add-in's claim, said so) or the changeset's own geometry. */
export const REVIT = "revit (claimed)", FILED = "as filed";
/** MA-4f: the most triangles a wall's re-read may hold — a straight wall after its joins is about 12; past about 50 a solid is curved or swept
 *  and fails "one plane" anyway (MA-5). The add-in sends none past it (PlacementGeometry.MaxMeshTriangles); 200 walls of 64 are ~1.2 MB of body. */
export const MAX_MESH_TRIANGLES = 64;

/** MA-4f: null when `m` is a re-read the bridge can read — 1 to MAX_MESH_TRIANGLES triangles, 9 finite numbers each (x, y, z of three corners,
 *  mm, Revit's internal frame), each within 1e9 mm — else what is wrong, in words. Pure. */
export function readMesh(m) {
  if (!Array.isArray(m) || !m.length || m.length % 9) return "not a list of triangles (9 numbers each)";
  if (m.length / 9 > MAX_MESH_TRIANGLES) return `${m.length / 9} triangles — over the ${MAX_MESH_TRIANGLES} a wall's re-read holds`;
  for (let i = 0; i < m.length; i++) if (!Number.isFinite(m[i]) || Math.abs(m[i]) > 1e9) return `number ${i} is not a coordinate in mm`;
  return null;
}

/** MA-4f: Revit's re-read of a placed wall (readMesh's triangles) as the two faces sentinel-survey measures — facesOf's shape and order, in the
 *  MODEL's frame (verify moves them into the scan's): of the triangles whose unit normal is square to the filed line's left normal (|n̂·p| ≥ 0.99;
 *  the winding is not trusted; an end, the top and the base are left out), split at the middle of their offsets from the line, each side's
 *  bounding rectangle along the line and up — when it is one plane (its offsets within 1 mm). It sees the type's real width, the location line
 *  and each side's own ends (Revit's joins). The claim is held to the bridge's own facts of the filed wall (its line, measured thickness, base
 *  and top): past them it is not this wall as filed, and the wall is measured as filed. → {faces} or {why}. Pure.
 *  ponytail: a bounding rectangle per side — an opening is drawn over; no survey wall has one before MA-5. */
export function meshFaces(el, m) {
  const c = el.place?.LocationCurve, t = el.facts?.thickness_mm, zt = el.place?.TopElevation;
  if (!Array.isArray(c?.start) || !Array.isArray(c?.end) || !Number.isFinite(c.start[2]) || !(t > 0) || !Number.isFinite(zt))
    return { why: "its line, measured thickness or top is not on the changeset" }; // facesOf's words
  const [ax, ay, zb] = c.start, L = Math.hypot(c.end[0] - ax, c.end[1] - ay);
  if (!(L >= 1) || !(zt > zb)) return { why: "its line is shorter than 1 mm, or its top not above its base" }; // facesOf's words
  const ux = (c.end[0] - ax) / L, uy = (c.end[1] - ay) / L, px = -uy, py = ux; // p: the line's left, facesOf's n
  const at = [];
  for (let i = 0; i < m.length; i += 9) {
    const [x0, y0, z0, x1, y1, z1, x2, y2, z2] = m.slice(i, i + 9);
    const e = [x1 - x0, y1 - y0, z1 - z0], f = [x2 - x0, y2 - y0, z2 - z0];
    const n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]], len = Math.hypot(...n);
    if (!(len > 0) || Math.abs(n[0] * px + n[1] * py) / len < 0.99) continue;
    for (const [x, y, z] of [[x0, y0, z0], [x1, y1, z1], [x2, y2, z2]]) at.push({ o: (x - ax) * px + (y - ay) * py, u: (x - ax) * ux + (y - ay) * uy, z });
  }
  if (!at.length) return { why: "Revit's solid has no face along its filed line" };
  const lo = Math.min(...at.map((q) => q.o)), hi = Math.max(...at.map((q) => q.o)), mid = (lo + hi) / 2;
  if (hi - lo < 1) return { why: "Revit's solid has one side along its filed line" };
  const box = (qs, side) => {
    const o = qs.map((q) => q.o), deep = Math.max(...o) - Math.min(...o);
    if (deep > 1) return { why: `its ${side} side is not one plane (${Math.round(deep)} mm deep: a sweep, a reveal or a turn)` };
    const us = qs.map((q) => q.u), zs = qs.map((q) => q.z);
    // Final review: under 1 mm along or up, sentinel-survey refuses the face (rectangle(): both sides at least 1 mm) and every measure fails.
    if (Math.max(...us) - Math.min(...us) < 1 || Math.max(...zs) - Math.min(...zs) < 1) return { why: `its ${side} side is under 1 mm across` };
    return { off: o.reduce((s, v) => s + v, 0) / o.length, u0: Math.min(...us), u1: Math.max(...us), z0: Math.min(...zs), z1: Math.max(...zs) };
  };
  const l = box(at.filter((q) => q.o > mid), "left"), r = box(at.filter((q) => q.o <= mid), "right");
  if (l.why) return l;
  if (r.why) return r;
  // MA-4f (critique): the bounds — each side within half the thickness and one more thickness of the filed line (the location line, the type's
  // real width), its ends within a thickness and 100 mm of the filed ends (Revit's joins), its height within 100 mm of the filed base and top.
  // Final review: both ways — a side short of its filed ends or height (a patch the claim chose) is as far off as one past them.
  const past = Math.max(...[l, r].flatMap((b) => [Math.abs(b.off) - 1.5 * t, -(t + 100) - b.u0, b.u1 - (L + t + 100), zb - 100 - b.z0, b.z1 - (zt + 100),
    b.u0 - (t + 100), (L - t - 100) - b.u1, b.z0 - (zb + 100), (zt - 100) - b.z1]));
  if (past > 0) return { why: `Revit's re-read is ${Math.round(past)} mm off its filed wall — measured as filed` };
  const pt = (b, u, z) => [r1(ax + ux * u + px * b.off), r1(ay + uy * u + py * b.off), r1(z)];
  return { faces: [
    [pt(l, l.u0, l.z0), pt(l, l.u0, l.z1), pt(l, l.u1, l.z0)],    // facesOf's left face, out to the left
    [pt(r, r.u0, r.z0), pt(r, r.u1, r.z0), pt(r, r.u0, r.z1)]] }; // its right face, out to the right
}

/** What a measure sends for a placed survey changeset: per element Revit placed (result.applied, in its order) its faces in the scan's frame,
 *  or why not — an Undo in Revit (`undone(guid)`: the ledger id when the guid's newest changeset_reverted row is an undo, else null), a level,
 *  a floor or ceiling, a wall whose geometry is not on the changeset. Pure. → {send: [{guid, faces}], skip: [{proposal_guid, reason}],
 *  placed: [{proposal_guid, revit_unique_id, cid, kind}]}
 *  ponytail: walls only — a floor's or ceiling's other face is its type's, which no scan measured, and the slab beyond counts against its one
 *  face (measured: ~200 mm on the drill); a depth from its type is MA-4h's.
 *  MA-4f: a wall Revit re-read at Apply is sent by its re-read's faces (reference REVIT, its mesh's sha), else as filed (FILED); placed[i].reference is set only when its faces are sent. */
export function measurePlan(cs, undone = () => null) {
  const S = toScan(cs.job.frame), send = [], skip = [], placed = [];
  for (const a of cs.result?.applied ?? []) {
    const el = (cs.elements ?? []).find((e) => e.proposal_guid === a.proposal_guid), u = undone(a.proposal_guid);
    const rr = el?.kind === "wall" ? a.reread : null;
    const f = u != null ? { why: `undone in Revit (ledger #${u}) — nothing placed to measure` }
      : rr?.faces ? { faces: rr.faces.map((q) => q.map(([x, y, z]) => [...S.xy([x, y]), S.z(z)])), reference: REVIT, mesh_sha256: rr.mesh_sha256 }
      : el?.kind === "wall" ? { ...facesOf(el, S), reference: FILED }
      : el?.kind === "level" ? { why: "a level has no face to measure — its height against the scan is MA-4h's level error" }
      : el?.kind === "floor" || el?.kind === "ceiling" ? { why: `one face of a ${el.kind} is seen; its other is its type's, which no scan measured, and the slab beyond would count against it — MA-4h` }
      : { why: el ? `a ${el.kind} is not measured by sentinel-survey 0.1` : "not on the changeset" };
    placed.push({ proposal_guid: a.proposal_guid, revit_unique_id: a.revit_unique_id ?? null, cid: el?.cid ?? null, kind: el?.kind ?? null,
      ...(f.faces ? { reference: f.reference, ...(f.mesh_sha256 ? { mesh_sha256: f.mesh_sha256 } : {}) } : {}) });
    if (f.faces) send.push({ guid: a.proposal_guid, faces: f.faces }); else skip.push({ proposal_guid: a.proposal_guid, reason: f.why });
  }
  return { send, skip, placed };
}

/** The bridge's verdict on one element sentinel-survey measured (rule 3: the service measures, the bridge judges) — p95 against D7's
 *  TOLERANCE_MM. `k`: the service's receipt.measure {band_mm, edge_mm}. → {status, reason?}. Pure. */
export function judge(m, k) {
  if (m.coverage == null) return { status: "not_measured", reason: `no face interior to measure — each face is read ${k.edge_mm} mm in from every edge` };
  if (!m.points) return { status: "missing", reason: `no scan point within ${k.band_mm} mm of its faces — not built where it stands, or not scanned there` };
  if (m.coverage < MIN_COVERAGE) return { status: "insufficient_data", reason: `${Math.round(m.coverage * 1000) / 10}% of its faces seen — under the ${MIN_COVERAGE * 100}% a verdict needs` };
  return { status: m.p95_mm <= TOLERANCE_MM ? "within_tolerance" : "out_of_tolerance" };
}

/** The keys a measured element may carry (spec amendment S3: numbers only) — anything else, a status above all, is the bridge's. */
const MEASURE_KEYS = new Set(["guid", "points", "p95_mm", "mean_signed_mm", "share_within", "coverage"]);
export const MEASURE_KNOBS = ["band_mm", "edge_mm", "cell_mm"];
const share = (v) => Number.isFinite(v) && v >= 0 && v <= 1;

/** null when a measure's result has the contract's shape — one entry per element sent, in order, the five numbers only (or null), each in
 *  range, its knobs on the receipt — else what is wrong (the bridge keeps nothing it could not judge; a verdict sent by the service is refused,
 *  never merged: rule 3). Pure. */
export function measureRefusal(res, send, tols) {
  const k = res?.receipt?.measure;
  // Final review: the knobs are the three the service has, all numbers — nothing else rides onto the bridge's row.
  if (!k || typeof k !== "object" || Object.keys(k).some((x) => !MEASURE_KNOBS.includes(x)) || !MEASURE_KNOBS.every((x) => Number.isFinite(k[x]))) return "receipt.measure";
  if (!Array.isArray(res.elements) || res.elements.length !== send.length) return "not one result per element sent";
  for (const [i, m] of res.elements.entries()) {
    const at = `elements[${i}]`;
    const extra = Object.keys(m ?? {}).find((x) => !MEASURE_KEYS.has(x));
    if (extra) return `${at} carries ${extra.slice(0, 64)} (the verdict is the bridge's)`;
    if (m?.guid !== send[i].guid) return `${at}.guid`;
    if (!Number.isInteger(m.points) || m.points < 0) return `${at}.points`;
    if (![m.p95_mm, m.mean_signed_mm, m.coverage].every((v) => v === null || Number.isFinite(v)) || m.p95_mm < 0 || (m.coverage !== null && !share(m.coverage)))
      return `${at}'s numbers`;
    if (m.points > 0 && (!Number.isFinite(m.p95_mm) || !tols.every((t) => share(m.share_within?.[t])))) return `${at}.share_within`;
    // Final review: the numbers agree with each other — no point means no p95, mean or shares (and nothing covered); points mean a
    // coverage and a mean (the service sends exactly that; anything else is not its contract, and judge would read it wrong).
    if (m.points === 0 && (m.p95_mm !== null || m.mean_signed_mm !== null || m.share_within != null || (m.coverage !== null && m.coverage !== 0))) return `${at}'s numbers`;
    if (m.points > 0 && (!Number.isFinite(m.mean_signed_mm) || m.coverage === null)) return `${at}'s numbers`;
  }
  return null;
}

// ── MA-4f: the scan overlay (design §4 "In Revit: a decimated overlay drawn with DirectContext3D"). sentinel-survey thins; the bridge cuts and
//    places. ──

/** The overlay's first cube, its most points (6 vertices each as Revit's crosses: 30 000, inside any 16-bit index — GhostOverlayGeometry
 *  ScanBudget) and how much of a storey's height is left out at the floor and at the ceiling. */
export const SCAN_CELL_MM = 100, SCAN_MAX = 5000, SCAN_MARGIN_MM = 300;

/** MA-4f: the heights the overlay shows, in the model's frame — the changeset's walls, from their lowest base to their highest top, less
 *  SCAN_MARGIN_MM at each end (no floor or ceiling carpet over a plan; the survey's own wall slice is mid-storey ±300 mm). null with no wall to
 *  show it against. Pure. */
export function scanBand(cs) {
  const w = (cs.elements ?? []).filter((e) => e.kind === "wall" && Number.isFinite(e.place?.LocationCurve?.start?.[2]) && Number.isFinite(e.place?.TopElevation));
  if (!w.length) return null;
  const lo = Math.min(...w.map((e) => e.place.LocationCurve.start[2])) + SCAN_MARGIN_MM, hi = Math.max(...w.map((e) => e.place.TopElevation)) - SCAN_MARGIN_MM;
  return hi > lo ? [lo, hi] : null;
}

/** MA-4f: null when sentinel-survey's overlay answer has the contract's shape — at most `cap` points of three whole mm (within 1e9), its
 *  receipt.cloud naming the cube used and how many the first cube kept — else what is wrong. Pure. */
export function cloudRefusal(res, cap) {
  const c = res?.receipt?.cloud;
  if (!c || !Number.isInteger(c.cell_mm) || !Number.isInteger(c.of)) return "receipt.cloud";
  if (!Array.isArray(res.points) || res.points.length > cap || res.points.length > c.of) return `not at most ${cap} points`;
  if (!res.points.every((p) => Array.isArray(p) && p.length === 3 && p.every((v) => Number.isInteger(v) && Math.abs(v) <= 1e9))) return "a point is not three whole numbers of mm";
  return null;
}
