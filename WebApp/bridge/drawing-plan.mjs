// MA-5a-4 — a drawing job's candidates to ONE changeset per drawing, the pure half (plan docs/superpowers/plans/2026-10-11-ma5a4-drawing-align.md).
// The lead states a 2-point alignment — two points on the paper and where each is in the model, optionally a third to check it — and the
// drawing's level and its height. The bridge computes the similarity (scale, turn, move) and expresses it as the survey's frame over
// paper × scale, so a drawing's walls are cornered, read inside or outside and typed by the survey planner's own code (survey-plan), and its
// doors typed as a scan's. Every element is `inferred` (what someone drew, not what was built) and never pre-ticked.
import { MAX_CHANGESET_ELEMENTS } from "./changesets-logic.mjs";
import { KIND_ENTITY } from "./changesets-typing.mjs";
import { SIZE_BAND_MM } from "./holding-logic.mjs";
import { toModel, placeRefusal, trimEnds, groupGaps, gapOf, typeOpening, pointAlong, nominal, TOLERANCE_MM, MAX_FRAME_MM, MAX_PLACED_MM, REVIT_BAD } from "./survey-plan.mjs";
import { locate } from "./wall-location.mjs";

const err = (status, message) => Object.assign(new Error(message), { status });
const bad = (m) => err(400, `${m} — nothing was saved`);
export const PLANNER = "drawing-planner";
export const PLANNER_VERSION = "0.1.0";
/** A check point landing further than this from where the lead said is a wrong point or a wrong pair (decision 1). */
export const CHECK_MAX_MM = 100;
const PAPER_MAX_MM = 2000, PAPER_MIN_APART = 10, MODEL_MIN_APART = 100, SCALE_MIN = 1, SCALE_MAX = 2000;
const BODY = ["item", "points", "check", "level", "elevation_mm"];
const r1 = (v) => Math.round(v * 10) / 10 || 0; // 0.1 mm, never -0
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/** The drawing a candidate came from: its evidence `<item>#page-1` (sentinel-drawing Job.cs). */
export const itemOf = (c) => String(c.evidence?.[0] ?? "").split("#")[0];

function pair(p, at) {
  if (!p || typeof p !== "object" || Array.isArray(p)) throw bad(`${at} is {paper: [x, y], model: [x, y]}`);
  for (const k of Object.keys(p)) if (k !== "paper" && k !== "model") throw bad(`${at}.${k.slice(0, 64)} is not read — a point is {paper: [x, y], model: [x, y]}`);
  const xy = (v, max, what) => {
    if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => Number.isFinite(n) && Math.abs(n) <= max))
      throw bad(`${at}.${what} must be [x, y], two numbers of mm within ±${max} (${what === "paper" ? "millimetres on the drawing's page 1, from its bottom-left corner" : "the model's internal coordinates"})`);
    return [v[0], v[1]];
  };
  return { paper: xy(p.paper, PAPER_MAX_MM, "paper"), model: xy(p.model, MAX_FRAME_MM, "model") };
}

/** POST …/propose's body for a drawing job → {item, points, check, level, elevation_mm}, or a 400 in words. `items`: the drawings the job
 *  read. Only the lead's statements are read; anything else is refused, never dropped — the bridge builds the rest. */
export function readAlignBody(b, items) {
  if (!b || typeof b !== "object" || Array.isArray(b)) throw bad("a drawing is proposed with {item?, points, check?, level?, elevation_mm}");
  for (const k of Object.keys(b))
    if (!BODY.includes(k)) throw bad(`${k.slice(0, 64)} is not a proposal field — a drawing is proposed with {item?, points, check?, level?, elevation_mm}; the bridge builds every changeset from the job's own result`);
  if (b.item != null && !items.includes(b.item)) throw bad(`item ${String(b.item).slice(0, 64)} is not a drawing this job read (${items.join(", ")})`);
  if (b.item == null && items.length > 1) throw bad(`the job read ${items.join(", ")} — name the drawing in item (one drawing, one alignment)`);
  if (!Array.isArray(b.points) || b.points.length !== 2)
    throw bad("points is two points, each {paper: [x, y], model: [x, y]} — where a mark is on the drawing (paper mm) and where it is in the model (mm)");
  const points = b.points.map((p, i) => pair(p, `points[${i}]`));
  if (dist(points[0].paper, points[1].paper) < PAPER_MIN_APART) throw bad(`the two points are under ${PAPER_MIN_APART} mm apart on the paper — pick two marks far apart (opposite corners of the plan)`);
  if (dist(points[0].model, points[1].model) < MODEL_MIN_APART) throw bad(`the two points are under ${MODEL_MIN_APART} mm apart in the model — pick two marks far apart`);
  const check = b.check == null ? null : pair(b.check, "check");
  let level = null;
  if (b.level != null) {
    if (typeof b.level !== "string" || !b.level.trim() || b.level.length > 256 || REVIT_BAD.test(b.level))
      throw bad("level must be a Revit level's name — one line of at most 256 characters, without \\ : { } [ ] | ; < > ? ` ~");
    level = b.level.trim();
  }
  if (!Number.isFinite(b.elevation_mm) || Math.abs(b.elevation_mm) > MAX_PLACED_MM)
    throw bad(`elevation_mm is required — the drawing's level height in the model, in mm (0 for a ground floor at the model's origin), within ±${MAX_PLACED_MM}`);
  return { item: b.item ?? items[0], points, check, level, elevation_mm: b.elevation_mm };
}

/** The similarity the two points fix — model = scale · R(rotation) · paper + (dx, dy) — rounded first (scale and turn to 1e-6, the move to
 *  0.1 mm) so the record reproduces every placement exactly. A scale outside 1:1 to 1:2000 is refused (a swapped point, or metres for mm). */
export function alignFrom(points) {
  const [A, B] = points;
  const dp = [B.paper[0] - A.paper[0], B.paper[1] - A.paper[1]], dm = [B.model[0] - A.model[0], B.model[1] - A.model[1]];
  const scale = Math.round((Math.hypot(...dm) / Math.hypot(...dp)) * 1e6) / 1e6;
  if (!(scale >= SCALE_MIN && scale <= SCALE_MAX))
    throw bad(`the two points give a scale of 1:${scale} — a plan is drawn at 1:${SCALE_MIN} to 1:${SCALE_MAX}; check that paper is in paper millimetres and model in model millimetres, and that both name the same two marks`);
  let deg = (((Math.atan2(dm[1], dm[0]) - Math.atan2(dp[1], dp[0])) * 180) / Math.PI) % 360;
  deg = Math.round((deg < 0 ? deg + 360 : deg) * 1e6) / 1e6;
  if (deg >= 360) deg = 0;
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return { scale, rotation_deg: deg, dx_mm: r1(A.model[0] - scale * (c * A.paper[0] - s * A.paper[1])), dy_mm: r1(A.model[1] - scale * (s * A.paper[0] + c * A.paper[1])) };
}

/** Where the alignment puts a paper point in the model, in plan (0.1 mm). */
export const paperToModel = (al, [x, y]) => toModel({ ...al, dz_mm: 0 }).xy([x * al.scale, y * al.scale]);

/** The check point's residual: how far from the lead's model point the alignment puts its paper point (0.1 mm); over CHECK_MAX_MM a 400. */
export function checkResidual(al, check) {
  const d = r1(dist(paperToModel(al, check.paper), check.model));
  if (d > CHECK_MAX_MM)
    throw bad(`the check point lands ${d} mm from where you said it is — more than the ${CHECK_MAX_MM} mm an alignment is trusted to; one of the three points is not where it was read`);
  return d;
}

/** The drawing's one storey: the level the lead named (its height checked when a published IFC holds the name); else the ONE published level
 *  within TOLERANCE_MM of the stated height; else a new level, `Drawing <item> <job-id>`. `was` (decision 19): the storey a changeset of this
 *  drawing was filed on — it keeps that level. */
function storeyOf(cid, item, E, level, manifest, jobId, was) {
  const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
  if (was) {
    if (level && !same(level, was.level)) throw bad(`${item} was filed on ${was.level} — leave level out, or read the drawing again to propose it afresh`);
    return { cid, level: was.level, how: "filed", elevation_mm: was.elevation_mm, delta_mm: was.delta_mm, checked: was.checked, from: was.from };
  }
  if (level) {
    const hit = manifest.find((l) => same(l.name, level));
    if (!hit) return { cid, level, how: "named", elevation_mm: E, delta_mm: null, checked: false, from: null };
    const d = r1(hit.elevation_mm - E);
    if (Math.abs(d) > TOLERANCE_MM)
      throw bad(`${hit.name} is at ${hit.elevation_mm} mm in ${hit.from}, and elevation_mm says ${E} — ${Math.abs(d)} mm apart, more than the ${TOLERANCE_MM} mm a match allows (D7); state the level's own height, or leave level out to have one created`);
    return { cid, level: hit.name, how: "named", elevation_mm: hit.elevation_mm, delta_mm: d, checked: true, from: hit.from };
  }
  const names = [...new Set(manifest.filter((l) => Math.abs(l.elevation_mm - E) <= TOLERANCE_MM).map((l) => l.name))];
  if (names.length > 1) throw bad(`the published models have ${names.join(" and ")} within ${TOLERANCE_MM} mm of ${E} mm — name one in level`);
  if (names.length === 1) {
    const hit = manifest.find((l) => l.name === names[0]);
    return { cid, level: hit.name, how: "matched", elevation_mm: hit.elevation_mm, delta_mm: r1(hit.elevation_mm - E), checked: true, from: hit.from };
  }
  return { cid, level: `Drawing ${item} ${jobId}`, how: "created", elevation_mm: E, delta_mm: 0, checked: true, from: null };
}

/** The plan of one drawing of a trusted drawing job → {storeys: [{storey, body | null, byCid, exceptions, once}], groups, already_filed,
 *  alignment} in planSurvey's shape (changesets-store files it the same way). `align`: readAlignBody's; `filed` (decision 19) {cids,
 *  storeys}. byCid: the bridge's trust record of each element it built. Throws 400/413 in words; writes nothing. */
export function planDrawing({ job, candidates, align, manifest = [], type, filed = { cids: new Set(), storeys: new Map() }, catalog = { types: [] }, sameCategory }) {
  const { item } = align, al = alignFrom(align.points);
  const check_mm = align.check ? checkResidual(al, align.check) : null;
  const S = al.scale, E0 = align.elevation_mm;
  const frame = { dx_mm: al.dx_mm, dy_mm: al.dy_mm, dz_mm: E0, rotation_deg: al.rotation_deg };
  const M = toModel(frame), sc = ([x, y]) => [x * S, y * S, 0];
  const mine = candidates.filter((c) => itemOf(c) === item);
  const walls = mine.filter((c) => c.kind === "wall").map((c) => ({ c, start: sc(c.geometry.LocationCurve.start), end: sc(c.geometry.LocationCurve.end),
    t: Math.round(c.measured.thickness_paper_mm * S), len: Math.round(c.measured.length_paper_mm * S) }));
  const doors = mine.filter((c) => c.kind === "door");
  const lvCid = `drawing-${item}-p1-level`, evidence = [`${item}#page-1`];
  const far = placeRefusal([{ kind: "level", geometry: { BaseElevation: 0 } }, ...walls.map((w) => ({ kind: "wall", geometry: { LocationCurve: { start: w.start, end: w.end } } })),
    ...doors.map((c) => ({ kind: "door", geometry: { Location: sc(c.geometry.Location) } }))], frame);
  if (far) throw bad(`${far.split("; state where")[0].replace("the frame puts the scan", "the points put the drawing")}; check the points' model coordinates`);
  const s = storeyOf(lvCid, item, E0, align.level, manifest, job.id, filed.storeys.get(lvCid)), E = s.elevation_mm;
  const ref = `${job.id} (ledger #${job.ledger.id})`, at = `${item} page 1 at 1:${S}`;
  const alignment = { method: "2-point similarity", item, points: align.points, check: align.check, scale: S, rotation_deg: al.rotation_deg,
    dx_mm: al.dx_mm, dy_mm: al.dy_mm, dz_mm: E0, check_mm, rmse_mm: null };
  const gaps = [], elements = [], byCid = new Map(), exceptions = [];
  let already = 0;
  const again = (cid) => { if (!filed.cids.has(cid)) return false; already++; return true; };
  // decision 11: drawn, not measured — `inferred`, never pre-ticked (Revit's ChangesetTrust pre-ticks only within_tolerance)
  const trust = (measured, extra = {}) => ({ measured, accuracy: { status: "inferred", basis: "drawing", from_job: job.id, scale: S, check_mm }, pretick: false, ...extra });
  const gap = (c, g, why = null) => {
    gaps.push({ ...g, label: `${s.level} · ${c.cid}`.slice(0, 256), evidence: c.evidence });
    exceptions.push({ unique_id: c.cid.slice(0, 64), name: `${c.kind} ${c.cid}`.slice(0, 256),
      reason: `type gap — ${why ?? (g.want ? `${g.want} is not in the type catalogue` : `no office rule types it (${g.key})`)}; it waits in the Holding Area`.slice(0, 300) });
  };
  const hold = (c, why) => exceptions.push({ unique_id: c.cid.slice(0, 64), name: `${c.kind} ${c.cid}`.slice(0, 256), reason: why.slice(0, 300) });

  const trimmed = trimEnds(walls.map((w) => ({ start: w.start, end: w.end, width: w.t })));
  const segs = trimmed.map((x, i) => ({ x0: x.start[0], y0: x.start[1], x1: x.end[0], y1: x.end[1], width: walls[i].t }));
  const typed = walls.map((w, i) => {
    const loc = locate(segs, i), facts = { thickness_mm: w.t, ...(loc.location ? { params: { Location: loc.location } } : {}) };
    return { facts, loc, gap: gapOf(type, "wall", facts, w.c.cid, loc.why) };
  });
  walls.forEach(({ c, t, len }, i) => {
    if (again(c.cid)) return;
    const { facts, loc, gap: g } = typed[i];
    if (g) return gap(c, g);
    const tr = trimmed[i].trim_mm;
    const toGap = trimmed[i].to.map((j, k) => (j != null && typed[j].gap ? `the ${k ? "end" : "start"} to ${walls[j].c.cid}'s centreline: a type gap, not placed` : null)).filter(Boolean);
    elements.push({ op: "create", kind: "wall", cid: c.cid, evidence: c.evidence, facts, validate: { identity: { Class: KIND_ENTITY.wall, Name: c.cid } },
      place: { LevelName: s.level, LocationCurve: { start: [...M.xy(trimmed[i].start), E], end: [...M.xy(trimmed[i].end), E] } },
      reason: (`drawn wall ${c.cid}: ${t} mm thick (${c.measured.thickness_paper_mm} paper mm), ${len} mm long, on ${at} · ` +
        `${loc.location ? `Location ${loc.location}` : `inside or outside not read (${loc.why})`} · ends ${tr.join(" / ")} mm to the corners` +
        `${toGap.length ? ` (${toGap.join("; ")})` : ""} · ` +
        `height not drawn (the next level up) · drawn, not measured · ${ref}`).slice(0, 500) });
    byCid.set(c.cid, trust({ ...c.measured, thickness_mm: t, length_mm: len }, { trim_mm: tr }));
  });
  // A door after the walls (the executor hosts it in the one wall under its point). Its width the tag's when it has one (the designer's
  // nominal), else its swing's to the nearest 100 mm; its height the tag's only — a plan draws no height (decision 6).
  for (const c of doors) {
    if (again(c.cid)) continue;
    const host = c.geometry.host, hi = walls.findIndex((w) => w.c.cid === host), m = c.measured, drawn = Math.round(m.width_paper_mm * S);
    if (!s.checked) { hold(c, `its level ${s.level} is in no published model, so its height in Revit is unknown here — Revit refuses a door off its level's height; name a published level, or leave level out to have it created`); continue; }
    if (hi < 0) { hold(c, `its host wall ${host} is not a wall of ${item} in ${job.id}`); continue; }
    if (typed[hi].gap && !filed.cids.has(host)) { hold(c, `its host wall ${host} is a type gap — propose the drawing again once the wall's group in the Holding Area closes`); continue; }
    if (!Number.isFinite(m.tag_height_mm)) { hold(c, `its height is not drawn (no W x H tag beside its swing; ${drawn} mm wide as drawn) — a person places this door`); continue; }
    if (Number.isFinite(m.tag_width_mm) && Math.abs(m.tag_width_mm - drawn) > SIZE_BAND_MM) {
      hold(c, `its swing is drawn ${drawn} mm wide at 1:${S} and its tag says ${m.tag_width_mm} — more than ${SIZE_BAND_MM} mm apart: check the alignment's scale, or the tag is another door's`);
      continue;
    }
    const w = Number.isFinite(m.tag_width_mm) ? m.tag_width_mm : nominal(drawn), h = m.tag_height_mm;
    const { facts, g, by, why } = typeOpening({ type, kind: "door", cid: c.cid, w, h, hostFunction: typed[hi].loc?.location, catalog, sameCategory });
    if (g) { gap(c, g, why); continue; }
    const U = walls[hi], p = pointAlong(U.start, U.end, c.geometry.along_paper_mm * S); // the untrimmed centreline: along is from its start
    elements.push({ op: "create", kind: "door", cid: c.cid, evidence: c.evidence, facts, validate: { identity: { Class: KIND_ENTITY.door, Name: c.cid } },
      place: { LevelName: s.level, Location: [...M.xy(p), E], ...(by ? { FamilyName: by.family, TypeName: by.type } : {}) },
      reason: (`drawn door ${c.cid} in ${host}: W${w} x H${h} mm (${Number.isFinite(m.tag_width_mm) ? `its tag; swing ${drawn} mm` : `swing ${drawn} mm, height from its tag`}) on ${at} · ` +
        `${by ? `typed by size from the catalogue: ${by.family} : ${by.type}` : "typed by an office rule"} · its facing not read · drawn, not measured · ${ref}`).slice(0, 500) });
    byCid.set(c.cid, trust({ ...m, width_mm: w, height_mm: h },
      by ? { typing: { typed_by: "bridge-size", type: by.type, family: by.family, size: `${w} x ${h} mm`, band_mm: SIZE_BAND_MM, catalog: catalog.label ?? null, catalog_sha256: catalog.sha256 ?? null } } : {}));
  }
  if (elements.length && s.how === "created") {
    elements.unshift({ op: "create", kind: "level", cid: lvCid, evidence, validate: { identity: { Class: "IFCBUILDINGSTOREY", Name: s.level } },
      place: { BaseElevation: E, Name: s.level }, reason: `a new level for ${item} at ${E} mm in the model, as the lead stated · ${ref}`.slice(0, 500) });
    byCid.set(lvCid, trust({ elevation_mm: E }));
  }
  if (elements.length > MAX_CHANGESET_ELEMENTS)
    throw err(413, `${item} would file ${elements.length} elements on ${s.level} — over the ${MAX_CHANGESET_ELEMENTS} one changeset (one Undo) holds; nothing was saved`);
  const body = elements.length ? { name: `Drawing ${job.id} · ${item} · ${s.level}`, contract: 2, source: `${job.reader} ${job.version}`, elements, exceptions } : null;
  return { storeys: [{ storey: s, body, byCid, exceptions, once: [] }], groups: groupGaps(gaps), already_filed: already, alignment };
}
