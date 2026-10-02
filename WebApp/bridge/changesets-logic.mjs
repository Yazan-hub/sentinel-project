// Governed AI modeling — the pure half of staged changesets. An agent's proposed elements are
// validated (vocabulary + per-kind geometry sanity), adjudication failures are mapped back to the
// element that earned them, and the lifecycle rules live here where they are unit-testable.
//
// THE REFEREE RULE: nothing in this feature creates model data. A changeset is a PROPOSAL — the
// Revit add-in executes only what a human ticks, and only after re-checking the status. A Ghost Builder
// build (source "dwg", MA-1a step 2) is ticked in Ghost's own review, layer by layer, before it is filed,
// and the add-in runs it as filed.
import { randomUUID } from "node:crypto";

// MA-1 placement slice: roof, ceiling, door, window. MA-1a step 2: column, furniture — Ghost Builder's unhosted point families.
export const VOCABULARY = ["wall", "floor", "level", "grid", "roof", "ceiling", "door", "window", "column", "furniture"];
/** What a ghost does. create places a new element (the v1 path); retype changes an EXISTING element's type, named by its
 *  Revit UniqueId (Promote) — a door or window keeps its host: ChangeTypeId to a symbol of the same category; attach re-tops
 *  an existing wall. An element without op is a create. */
export const OPS = ["create", "retype", "attach"];
/** The kinds each op takes. */
export const OP_KINDS = { create: VOCABULARY, retype: ["wall", "floor", "roof", "ceiling", "door", "window"], attach: ["wall"] };
export const MAX_CHANGESET_ELEMENTS = 200;
export const MAX_CHANGESET_EXCEPTIONS = 1000;
export const MAX_BOUNDARY_POINTS = 256;
export const MAX_OFFSET_MM = 100000;

const err = (status, message) => Object.assign(new Error(message), { status });
const finite = (n) => typeof n === "number" && Number.isFinite(n);
const point = (p) => Array.isArray(p) && p.length === 3 && p.every(finite);
const text = (s, max) => typeof s === "string" && s.trim() !== "" && s.length <= max;
// Revit's UniqueId: the episode GUID, then "-", then the element id as 8 hex digits.
const UNIQUE_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}-[0-9a-f]{8}$/i;
const inRange = (n, lo, hi) => finite(n) && n >= lo && n <= hi;
// MA-1a item 4: an element's provenance as its placer knows it (checkProvenance).
const PROVENANCE_FIELDS = ["layer", "rule", "source_sha256"];
const SHA256_HEX = /^[0-9a-f]{64}$/;
// Review amendment C1: no control character (a newline, a tab) in a provenance text — each is one line wherever it is shown.
const CONTROL_CHAR = /[\u0000-\u001f]/;
// How far (mm, in plan) an arc's mid point sits off the chord start→end; < 1 mm is no arc.
const arcSag = (s, e, m) => {
  const dx = e[0] - s[0], dy = e[1] - s[1], chord = Math.hypot(dx, dy);
  return chord === 0 ? 0 : Math.abs(dx * (m[1] - s[1]) - dy * (m[0] - s[0])) / chord;
};
// MA-1: the create place fields and the kinds that take them — a field on any other kind is a 400, never ignored (a level's
// or grid's name is identity.Name, so it has no Mark; only a point family's type — door, window, column, furniture — is named
// with its family).
const PLACE_FIELDS = {
  FamilyName: ["door", "window", "column", "furniture"], Mark: ["wall", "floor", "roof", "ceiling", "door", "window", "column", "furniture"],
  Structural: ["floor"], Location: ["door", "window", "column", "furniture"], FlipFacing: ["door", "window"], FlipHand: ["door", "window"],
  SillHeight: ["window"], Boundary: ["roof", "ceiling"], BaseOffset: ["roof"], Offset: ["ceiling"],
};
// The point kinds: a family placed at place.Location on its level — a door or window in the one wall under it, a column or
// furniture unhosted (MA-1a step 2).
const POINT_KINDS = ["door", "window", "column", "furniture"];

const MIN_EDGE_MM = 1; // Revit refuses a line shorter than about 0.8 mm
const xy = (p) => Array.isArray(p) && p.length === 2 && p.every(finite);
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const within = (a, b, p) => Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
/** Whether segments ab and cd share any point: a crossing, a touch or a collinear overlap. */
function meet(a, b, c, d) {
  const d1 = Math.sign(cross(a, b, c)), d2 = Math.sign(cross(a, b, d)), d3 = Math.sign(cross(c, d, a)), d4 = Math.sign(cross(c, d, b));
  if (d1 !== d2 && d3 !== d4) return true;
  return (d1 === 0 && within(a, b, c)) || (d2 === 0 && within(a, b, d)) || (d3 === 0 && within(c, d, a)) || (d4 === 0 && within(c, d, b));
}

/** MA-1: a roof's or ceiling's outline in plan, [[x,y],…] mm, a closing point equal to the first allowed: why Revit could not
 *  sketch it as one simple closed loop, or null. Exact arithmetic on the numbers sent. ponytail: O(n²) pair test, fine at 256
 *  points x 200 elements; a sweep if outlines ever grow. */
export function outlineProblem(b) {
  if (!Array.isArray(b) || b.length < 3 || b.length > MAX_BOUNDARY_POINTS || !b.every(xy)) return `must be 3 to ${MAX_BOUNDARY_POINTS} finite [x,y] points`;
  const n = b.length - (b[0][0] === b.at(-1)[0] && b[0][1] === b.at(-1)[1] ? 1 : 0);
  if (n < 3) return "needs 3 points besides a closing one";
  const at = (i) => b[i % n];
  for (let i = 0; i < n; i++)
    if (Math.hypot(at(i + 1)[0] - at(i)[0], at(i + 1)[1] - at(i)[1]) < MIN_EDGE_MM) return `has an edge shorter than ${MIN_EDGE_MM} mm, Boundary[${i}]→[${(i + 1) % n}]`;
  for (let i = 0; i < n; i++) {
    const [p, q, r] = [at(i + n - 1), at(i), at(i + 1)];
    if (cross(p, q, r) === 0 && (q[0] - p[0]) * (r[0] - q[0]) + (q[1] - p[1]) * (r[1] - q[1]) < 0) return `doubles back on itself at Boundary[${i}]`;
  }
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++)
      if (!(i === 0 && j === n - 1) && meet(at(i), at(i + 1), at(j), at(j + 1)))
        return `crosses or touches itself: Boundary[${i}]→[${(i + 1) % n}] and [${j}]→[${(j + 1) % n}]`;
  // Last: a symmetric bow-tie's signed area cancels to 0, so the crossing test must speak first.
  let area2 = 0;
  for (let i = 0; i < n; i++) area2 += cross([0, 0], at(i), at(i + 1));
  if (Math.abs(area2) < 2) return "encloses less than 1 mm²";
  return null;
}

/** Per-kind geometry sanity. Deliberately shallow: real placement failures surface in Revit's
 *  transaction (and roll the whole changeset back) — this guards against garbage, not bad design. */
function checkPlace(kind, place, at) {
  if (!place || typeof place !== "object") throw err(400, `${at}: place is required`);
  for (const [f, kinds] of Object.entries(PLACE_FIELDS))
    if (place[f] !== undefined && !kinds.includes(kind)) throw err(400, `${at}: a ${kind} takes no place.${f}`);
  if (place.Mark !== undefined && !text(place.Mark, 256)) throw err(400, `${at}: place.Mark must be text of at most 256 characters`);
  for (const f of ["Structural", "FlipFacing", "FlipHand"])
    if (place[f] !== undefined && typeof place[f] !== "boolean") throw err(400, `${at}: place.${f} must be true or false`);
  if (kind === "wall" || kind === "grid") {
    const c = place.LocationCurve;
    if (!c || !point(c.start) || !point(c.end)) throw err(400, `${at}: ${kind} needs place.LocationCurve with finite [x,y,z] start and end`);
    // Distinctness is near-free to check here; a zero-length curve would cost a whole-changeset
    // Revit transaction rollback (up to 200 elements) for trivially detectable garbage.
    if (c.start.every((v, i) => v === c.end[i])) throw err(400, `${at}: ${kind} LocationCurve start and end are identical (zero-length)`);
    // MA-1a step 2: an arc wall carries one more point on its arc (Ghost Builder's curved DWG walls); a grid stays straight.
    if (c.mid !== undefined && (kind !== "wall" || !point(c.mid))) throw err(400, `${at}: place.LocationCurve.mid is a wall's point on its arc, a finite [x,y,z]`);
    // A mid on the chord (or on an end) makes no arc: Arc.Create would throw and decline the whole changeset.
    if (c.mid !== undefined && arcSag(c.start, c.end, c.mid) < 1) throw err(400, `${at}: place.LocationCurve.mid lies on the line from start to end — that is a straight wall, send it without mid`);
    if (kind === "wall" && place.BaseElevation !== undefined && !finite(place.BaseElevation)) throw err(400, `${at}: BaseElevation must be a finite number`);
    if (kind === "wall" && place.TopElevation !== undefined && !finite(place.TopElevation)) throw err(400, `${at}: TopElevation must be a finite number`);
  } else if (kind === "floor") {
    const loop = place.LocationLoop;
    if (!Array.isArray(loop) || loop.length < 3 || !loop.every(point)) throw err(400, `${at}: floor needs place.LocationLoop of at least 3 finite [x,y,z] points`);
    const distinct = new Set(loop.map((p) => p.join(","))).size;
    if (distinct < 3) throw err(400, `${at}: floor LocationLoop needs at least 3 DISTINCT points (got ${distinct})`);
  } else if (kind === "level") {
    if (!finite(place.BaseElevation)) throw err(400, `${at}: level needs a finite numeric place.BaseElevation`);
  } else if (POINT_KINDS.includes(kind)) {
    if (!point(place.Location)) throw err(400, kind === "door" || kind === "window"
      ? `${at}: a ${kind} needs place.Location, the finite [x,y,z] point on its host wall's location line (z = its level's elevation)`
      : `${at}: a ${kind} needs place.Location, the finite [x,y,z] point it stands on (z = its level's elevation)`);
    if (place.SillHeight !== undefined && !inRange(place.SillHeight, 0, MAX_OFFSET_MM)) throw err(400, `${at}: place.SillHeight must be a number of mm from 0 to ${MAX_OFFSET_MM}`);
  } else if (kind === "roof" || kind === "ceiling") {
    const why = outlineProblem(place.Boundary);
    if (why) throw err(400, `${at}: ${kind} place.Boundary ${why}`);
    const f = kind === "roof" ? "BaseOffset" : "Offset";
    if ((kind === "ceiling" || place[f] !== undefined) && !inRange(place[f], -MAX_OFFSET_MM, MAX_OFFSET_MM))
      throw err(400, `${at}: ${kind === "ceiling" ? "a ceiling needs " : ""}place.${f}, a number of mm within ±${MAX_OFFSET_MM}`);
  }
}

/** Validate + normalise a proposed changeset. Assigns proposal_guids (a posted one is ignored); a missing
 *  validate.identity.GlobalId is synced to the proposal_guid so adjudication failures (tagged by
 *  GlobalId) map back to the element that earned them. Each element comes back with its op, target and reason, and
 *  the changeset with its exceptions (the elements a planner sent to a person). The element is rebuilt field by field,
 *  so a field added to the shape must be added here too, or it is dropped without an error. */
export function validateChangeset(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw err(400, "a changeset must be an object");
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw err(400, "name is required — a changeset is reviewed by humans and needs a human-readable name");
  if (!Array.isArray(body.elements) || !body.elements.length) throw err(400, "elements must be a non-empty array");
  if (body.elements.length > MAX_CHANGESET_ELEMENTS) throw err(413, `too many elements (${body.elements.length}; limit ${MAX_CHANGESET_ELEMENTS})`);

  const seen = new Set(); // (op, element) pairs: one ghost per change, so a wall can carry one retype and one attach
  const elements = body.elements.map((el, i) => {
    const at = `elements[${i}]`;
    if (!el || typeof el !== "object") throw err(400, `${at}: must be an object`);
    const op = el.op ?? "create";
    if (!OPS.includes(op)) throw err(400, `${at}: op "${op}" is not supported — allowed: ${OPS.join(", ")}`);
    if (!OP_KINDS[op].includes(el.kind)) throw err(400, `${at}: kind "${el.kind}" is not supported${op === "create" ? "" : ` for ${op}`} — allowed: ${OP_KINDS[op].join(", ")}`);
    const validate = el.validate && typeof el.validate === "object" ? el.validate : {};
    if (!validate.identity || typeof validate.identity.Class !== "string" || !validate.identity.Class)
      throw err(400, `${at}: validate.identity.Class is required (the IFC class adjudication reads)`);
    let target = null;
    if (op === "create") {
      checkPlace(el.kind, el.place, at);
      // After checkPlace, so a geometry error still reads as one. The Revit executor refuses an empty type too.
      if (el.kind !== "level" && el.kind !== "grid" && !text(el.place.TypeName, 256))
        throw err(400, `${at}: a ${el.kind} needs place.TypeName — Sentinel never takes the model's first type`);
      if (POINT_KINDS.includes(el.kind) && !text(el.place.FamilyName, 256))
        throw err(400, `${at}: a ${el.kind} needs place.FamilyName — a type name alone is not one type`);
      if (["roof", "ceiling", ...POINT_KINDS].includes(el.kind) && !text(el.place.LevelName, 256))
        throw err(400, `${at}: a ${el.kind} needs place.LevelName — Sentinel never picks its level`);
    } else {
      const uid = el.target?.unique_id;
      if (typeof uid !== "string" || !UNIQUE_ID.test(uid)) throw err(400, `${at}: ${op} needs target.unique_id, a Revit UniqueId`);
      const before = el.target.type_before ?? null;
      if (before !== null && !text(before, 256)) throw err(400, `${at}: target.type_before must be text of at most 256 characters`);
      const p = el.place && typeof el.place === "object" ? el.place : {};
      // A create's place fields ride on no retype or attach: the add-in would ignore them, and reads each into a typed field,
      // so one of the wrong type would fail every review in the project. A door's or window's retype names its family.
      for (const f of Object.keys(PLACE_FIELDS))
        if (p[f] !== undefined && !(f === "FamilyName" && op === "retype" && PLACE_FIELDS.FamilyName.includes(el.kind)))
          throw err(400, `${at}: ${op} takes no place.${f} — only a create sets it`);
      if (op === "retype" && !text(p.TypeName, 256)) throw err(400, `${at}: retype needs place.TypeName`);
      if (op === "retype" && (el.kind === "door" || el.kind === "window") && !text(p.FamilyName, 256))
        throw err(400, `${at}: a ${el.kind} retype needs place.FamilyName — a type name alone is not one type`);
      if (op === "attach" && (!text(p.BaseLevel, 256) || !text(p.TopLevel, 256) || p.BaseLevel === p.TopLevel))
        throw err(400, `${at}: attach needs two different levels, place.BaseLevel and place.TopLevel`);
      const k = `${op}:${uid.toLowerCase()}`;
      if (seen.has(k)) throw err(400, `${at}: a second ${op} for the same element`);
      seen.add(k);
      target = { unique_id: uid, type_before: before };
    }
    if (el.reason != null && !text(el.reason, 500)) throw err(400, `${at}: reason must be text of at most 500 characters`);
    if (validate.psets !== undefined && !Array.isArray(validate.psets)) throw err(400, `${at}: validate.psets must be an array`);
    if (validate.quantities !== undefined && !Array.isArray(validate.quantities)) throw err(400, `${at}: validate.quantities must be an array`);
    const provenance = checkProvenance(el.provenance, op, at);
    const proposal_guid = randomUUID();
    const identity = { ...validate.identity };
    if (!identity.GlobalId) identity.GlobalId = proposal_guid;
    return {
      proposal_guid,
      kind: el.kind,
      op, target, reason: el.reason ?? null,
      validate: { identity, psets: validate.psets || [], quantities: validate.quantities || [] },
      place: { ...el.place },
      ...(provenance ? { provenance } : {}), // MA-1a item 4: only when sent, so every other changeset reads as before
    };
  });

  return {
    name, source: typeof body.source === "string" && body.source.trim() ? body.source.trim() : "agent",
    elements, exceptions: checkExceptions(body.exceptions),
  };
}

/** MA-1a item 4: where an element came from, as its placer knows it — the CAD layer, the rule that typed it and the source
 *  file's sha256 — kept as filed, as a record. Optional, on a create only, and each field optional; any other key, a
 *  malformed value or a control character (a newline in a rule) is a 400, never dropped silently. A record only (review
 *  amendment C1): the add-in's stamp takes these facts from its own in-process placer, never from what the bridge returns. */
function checkProvenance(p, op, at) {
  if (p == null) return null;
  if (op !== "create") throw err(400, `${at}: ${op} takes no provenance — only a create carries one`);
  if (typeof p !== "object" || Array.isArray(p)) throw err(400, `${at}: provenance must be an object`);
  const extra = Object.keys(p).filter((k) => !PROVENANCE_FIELDS.includes(k));
  if (extra.length) throw err(400, `${at}: provenance takes only ${PROVENANCE_FIELDS.join(", ")} (got ${extra.join(", ")})`);
  if (p.layer != null && !text(p.layer, 256)) throw err(400, `${at}: provenance.layer must be text of at most 256 characters`);
  if (p.rule != null && !text(p.rule, 500)) throw err(400, `${at}: provenance.rule must be text of at most 500 characters`);
  if (p.source_sha256 != null && !(typeof p.source_sha256 === "string" && SHA256_HEX.test(p.source_sha256)))
    throw err(400, `${at}: provenance.source_sha256 must be 64 lowercase hex characters (a sha256)`);
  for (const f of ["layer", "rule"]) // the sha's 64 hex characters hold none already
    if (p[f] != null && CONTROL_CHAR.test(p[f])) throw err(400, `${at}: provenance.${f} must be one line — no control characters (a newline, a tab)`);
  return { layer: p.layer ?? null, rule: p.rule ?? null, source_sha256: p.source_sha256 ?? null };
}

/** The elements a planner sent to a person instead of proposing a change: optional, at most 1000 rows of
 *  {unique_id (≤64), name?, reason (≤300)}. They ride on the changeset for the reviewer; a bad row is a 400. */
function checkExceptions(rows) {
  if (rows == null) return [];
  if (!Array.isArray(rows)) throw err(400, "exceptions must be an array");
  if (rows.length > MAX_CHANGESET_EXCEPTIONS) throw err(400, `too many exceptions (${rows.length}; limit ${MAX_CHANGESET_EXCEPTIONS})`);
  return rows.map((x, i) => {
    const at = `exceptions[${i}]`;
    if (!x || typeof x !== "object") throw err(400, `${at}: must be an object`);
    if (!text(x.unique_id, 64)) throw err(400, `${at}: unique_id is required (at most 64 characters)`);
    if (!text(x.reason, 300)) throw err(400, `${at}: reason is required (at most 300 characters)`);
    if (x.name != null && !text(x.name, 256)) throw err(400, `${at}: name must be text of at most 256 characters`);
    return { unique_id: x.unique_id, name: x.name ?? null, reason: x.reason };
  });
}

/** Failures the adjudicator could not pin to a specific proposed element (no `element` tag, or a
 *  tag matching none of them). They belong to the changeset, not to any row — and their existence
 *  means a clean-looking element has NOT been certified. */
export function unattributedFailures(elements, adj) {
  const known = new Set(elements.map((el) => el.validate.identity.GlobalId));
  return (adj?.failures || []).filter((f) => !f.element || !known.has(f.element));
}

/** Attach per-element verdicts from an adjudication result. Failures are grouped by the GlobalId
 *  sentinel-core tags them with. HONESTY: with no spec (recorded) every element is "recorded" —
 *  never "accepted"; a green tick must mean a spec actually passed. And when the model verdict is
 *  rejected on grounds NOT attributable to a specific element, a clean element cannot claim
 *  "accepted" either — it drops to "recorded" (nothing was certified for it), with the
 *  unattributed failures surfaced at changeset level via unattributedFailures(). */
export function attachVerdicts(elements, adj) {
  const byId = new Map();
  for (const f of adj?.failures || []) {
    const k = f.element ?? "";
    if (!byId.has(k)) byId.set(k, []);
    byId.get(k).push(f);
  }
  const recorded = adj?.verdict === "recorded";
  // cde-store's adjudicateProposal caps failures at 200 (slice) — a full list may be truncated,
  // so a clean-looking element cannot be certified: taint to recorded, same as unattributed.
  const possiblyTruncated = (adj?.failures || []).length >= 200;
  const tainted = adj?.verdict === "rejected" && (unattributedFailures(elements, adj).length > 0 || possiblyTruncated);
  return elements.map((el) => {
    const failures = byId.get(el.validate.identity.GlobalId) || [];
    const status = recorded ? "recorded" : failures.length ? "rejected" : tainted ? "recorded" : "accepted";
    return { ...el, verdict: { status, failures } };
  });
}

export const canWithdraw = (status) => status === "proposed";

export function deriveResultStatus(appliedCount, rejectedCount, total) {
  if (appliedCount + rejectedCount !== total)
    throw err(400, `result must account for every element: ${appliedCount} applied + ${rejectedCount} rejected ≠ ${total}`);
  if (appliedCount === total) return "applied";
  if (appliedCount === 0) return "declined";
  return "partially_applied";
}
