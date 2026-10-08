// Governed AI modeling — the pure half of staged changesets. An agent's proposed elements are
// validated (vocabulary + per-kind geometry sanity), adjudication failures are mapped back to the
// element that earned them, and the lifecycle rules live here where they are unit-testable.
//
// THE REFEREE RULE: nothing in this feature creates model data. A changeset is a PROPOSAL — the
// Revit add-in executes only what a human ticks, and only after re-checking the status. A Ghost Builder
// build (source "dwg", MA-1a step 2) is ticked in Ghost's own review, layer by layer, before it is filed,
// and the add-in runs it as filed.
import { randomUUID } from "node:crypto";
import { checkFacts, KIND_ENTITY, KIND_PSET } from "./changesets-typing.mjs";

// MA-1 placement slice: roof, ceiling, door, window. MA-1a step 2: column, furniture — Ghost Builder's unhosted point families.
export const VOCABULARY = ["wall", "floor", "level", "grid", "roof", "ceiling", "door", "window", "column", "furniture"];
/** What a ghost does. create places a new element (the v1 path); retype changes an EXISTING element's type, named by its
 *  Revit UniqueId (Promote) — a door or window keeps its host: ChangeTypeId to a symbol of the same category; attach re-tops
 *  an existing wall. An element without op is a create. MA-2c: set_parameter writes one value on an existing TYPE, named by its
 *  UniqueId, from a cited source the bridge checks (value_source) — [BP] P2-7's item, built once. */
export const OPS = ["create", "retype", "attach", "set_parameter"];
/** The kinds each op takes. */
export const OP_KINDS = { create: VOCABULARY, retype: ["wall", "floor", "roof", "ceiling", "door", "window"], attach: ["wall"],
  set_parameter: ["wall", "floor", "roof", "ceiling", "door", "window"] };
export const MAX_CHANGESET_ELEMENTS = 200;
export const MAX_CHANGESET_EXCEPTIONS = 1000;
export const MAX_BOUNDARY_POINTS = 256;
export const MAX_OFFSET_MM = 100000;

const err = (status, message) => Object.assign(new Error(message), { status });
const finite = (n) => typeof n === "number" && Number.isFinite(n);
const point = (p) => Array.isArray(p) && p.length === 3 && p.every(finite);
const text = (s, max) => typeof s === "string" && s.trim() !== "" && s.length <= max;
const IFC_GUID = /^[0-9A-Za-z_$]{22}$/; // MA-3d: an IFC GlobalId as the export writes it (22 characters of its base64 alphabet)
// Revit's UniqueId: the episode GUID, then "-", then the element id as 8 hex digits.
const UNIQUE_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}-[0-9a-f]{8}$/i;
const inRange = (n, lo, hi) => finite(n) && n >= lo && n <= hi;
// MA-1a item 4: an element's provenance as its placer knows it (checkProvenance).
const PROVENANCE_FIELDS = ["layer", "rule", "source_sha256"];
const SHA256_HEX = /^[0-9a-f]{64}$/;
// Review amendment C1: no control character (a newline, a tab) in a provenance text — each is one line wherever it is shown.
const CONTROL_CHAR = /[\u0000-\u001f]/;
// MA-1a item 8 (contract 2's trust rules): the fields the bridge sets itself. A posted one is ignored and listed back.
export const TRUST_FIELDS = ["pretick", "accuracy", "confidence", "typing", "claimed", "proposal_guid"];
/** The sources the Revit add-in files under (GhostFiling, PromoteWallsPlanner). The bridge cannot tell the add-in from
 *  another caller holding the same credential, so every changeset's source is a claim (claimed: true); the MCP tool never
 *  files as one of these. */
export const ADDIN_SOURCES = ["dwg", "promote"];
const BODY_FIELDS = ["name", "source", "elements", "exceptions", "actor", "agent", "contract"]; // what a posted body is read for
// MA-2a: `facts` — the poster's thickness and parameters (Function, Location, Material, …), kept as a record and, on an element
// without place.TypeName, what the bridge types it from (changesets-typing).
// MA-2c: a set_parameter's parameter, the Revit parameter's name, the value the plan read (from), the value to write (to) and
// where it comes from (value_source — the bridge checks it and writes its own record).
const ELEMENT_FIELDS = ["kind", "op", "target", "reason", "validate", "place", "provenance", "cid", "evidence", "facts",
  "parameter", "revit_parameter", "from", "to", "value_source"]; // what an element is rebuilt from
// Review amendment C3: what an element's blocks are rebuilt from. PLACE_KEPT is the add-in's PlaceDto (ChangesetClient.cs),
// name for name; a key added to one must be added to the other, or it is listed under `ignored` and not kept.
const PLACE_KEPT = ["TypeName", "LevelName", "LocationCurve", "LocationLoop", "BaseElevation", "TopElevation", "Name", "BaseLevel", "TopLevel",
  "FamilyName", "Location", "SillHeight", "FlipFacing", "FlipHand", "Rotation", "Mirrored", "Boundary", "BaseOffset", "Offset", "Mark", "Structural"];
const TARGET_KEPT = ["unique_id", "type_before"];
const VALIDATE_KEPT = ["identity", "psets", "quantities"];
const MAX_EVIDENCE = 50; // review amendment C4: contract 2's evidence ids on one element
const SET_BY_BRIDGE = "ignored: set by the bridge";
const NOT_KEPT = "ignored: not a field this bridge keeps";
const CURVE_KEPT = ["start", "end", "mid"]; // a LocationCurve as the add-in reads it
const NOT_MEASURED = "ignored: no survey job the bridge ran backs it — accuracy.status is not_measured";
const NO_JOB = "ignored: a job named in a body backs nothing — the bridge files a survey job's changesets itself (POST /cde/:key/build/jobs/:id/propose); the source is marked claimed";
const MAX_IGNORED = 200;
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
  // MA-1b (GHB-1): a drawn block's direction — the plan angle of its X axis and whether it is mirrored. The add-in flips the
  // placed instance to that hinge side and swing side (ChangesetExecutor), and measures what Revit holds after the commit.
  Rotation: ["door", "window"], Mirrored: ["door", "window"],
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
  for (const f of ["Structural", "FlipFacing", "FlipHand", "Mirrored"])
    if (place[f] !== undefined && typeof place[f] !== "boolean") throw err(400, `${at}: place.${f} must be true or false`);
  if (place.Rotation !== undefined) {
    if (!finite(place.Rotation) || place.Rotation < 0 || place.Rotation >= 360)
      throw err(400, `${at}: place.Rotation must be a number of degrees from 0 up to (not including) 360 — the plan direction of the drawn block's X axis`);
    if (place.FlipFacing !== undefined || place.FlipHand !== undefined)
      throw err(400, `${at}: place.Rotation and place.FlipFacing or place.FlipHand say the same thing twice — send the block's Rotation (and Mirrored), or the flips, not both`);
  }
  if (place.Mirrored !== undefined && place.Rotation === undefined)
    throw err(400, `${at}: place.Mirrored needs place.Rotation — a mirror is read about the block's own X axis`);
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

/** MA-1a item 8: the stored source, always a string (deployed add-ins read it into one). A string is kept as filed;
 *  contract 2's object {reader, job_id} gives its reader — the job_id is ignored and listed, because a job named in a body
 *  backs nothing (MA-4d: the bridge files a survey job's changesets itself, proposeFromJob); anything else is "agent", as before. */
function sourceOf(s, note) {
  if (typeof s === "string" && s.trim()) return s.trim();
  if (s && typeof s === "object" && !Array.isArray(s)) {
    for (const k of Object.keys(s)) {
      if (k === "job_id") note("source.job_id", NO_JOB);
      else if (k !== "reader") note(`source.${k}`, NOT_KEPT);
    }
    if (text(s.reader, 256)) return s.reader.trim();
  }
  // Anything else that was sent (a list, a number, an object with no reader) is replaced, and the reply says so.
  if (s != null && typeof s !== "string") note("source", NOT_KEPT);
  return "agent";
}

/** MA-1a item 8, the pre-tick rule as the bridge can judge it today: a create is never pre-ticked (an agent ghost and a
 *  drawing-only ghost never are, and no evidence-backed ghost exists before MA-4); a retype or an attach is pre-ticked
 *  only as a single-answer Promote operation — a retype only with the type the plan saw — and only when a signed-in
 *  member filed it (review amendment C2): the source is the caller's own text, so the machine credential, which the
 *  bridge cannot tell from any other holder of the token, earns no pre-tick by writing "promote". MA-2c: a set_parameter is
 *  never pre-ticked — a type edit reaches every element on the type (founder decision F1). */
const pretickOf = (op, source, target, member) =>
  member === true && source === "promote" && (op === "attach" || (op === "retype" && target?.type_before != null));

const PSET_KEY = /^Pset_[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/;
const VALUE_SOURCES = ["catalogue", "clause"];

/** MA-2c (set_parameter, [BP] P2-7's item, built once): the type it writes (place.TypeName, and FamilyName for a door or
 *  window), the parameter ("Pset_X.Prop"), the Revit parameter's name, the value the plan read (`from`, "" when empty — the
 *  executor's stale guard compares it), the value to write and where it comes from. `cite` (changesets-typing.makeCiter) checks
 *  the source against the installed artefact and returns the bridge's own record; a source it cannot check is a 400 — nothing is
 *  written unchecked, and a person's own value is typed in Revit, not filed here. */
function checkWrite(el, place, at, cite) {
  if (!text(place.TypeName, 256)) throw err(400, `${at}: set_parameter needs place.TypeName — the type whose parameter it writes`);
  if ((el.kind === "door" || el.kind === "window") && !text(place.FamilyName, 256))
    throw err(400, `${at}: a ${el.kind} set_parameter needs place.FamilyName — a type name alone is not one type`);
  if (typeof el.parameter !== "string" || !PSET_KEY.test(el.parameter)) throw err(400, `${at}: set_parameter needs parameter, a "Pset_Name.Property" key`);
  // Review amendment C1: the kind's own property set only — a wall's catalogue "Fire Rating" is no door's.
  if (!el.parameter.startsWith(`${KIND_PSET[el.kind]}.`)) throw err(400, `${at}: a ${el.kind} set_parameter writes ${KIND_PSET[el.kind]}, not ${el.parameter}`);
  if (el.revit_parameter != null && (!text(el.revit_parameter, 256) || CONTROL_CHAR.test(el.revit_parameter)))
    throw err(400, `${at}: revit_parameter must be one line of at most 256 characters`);
  if (typeof el.from !== "string" || el.from.length > 500 || CONTROL_CHAR.test(el.from))
    throw err(400, `${at}: set_parameter needs from — the value the plan read, "" when empty (the stale guard compares it)`);
  // Review amendment C1: a set_parameter fills an EMPTY value only, whatever its source holds — the bridge's rule, not the planner's
  // alone (an agent's post through the MCP tool meets it too). The executor refuses a type that reads filled now, too.
  if (el.from.trim() !== "") throw err(400, `${at}: set_parameter fills an empty value only — a filled one is a person's (P2-7 edits it)`);
  if (!text(el.to, 500) || CONTROL_CHAR.test(el.to)) throw err(400, `${at}: set_parameter needs to — one line of at most 500 characters`);
  const vs = el.value_source;
  if (!vs || typeof vs !== "object" || Array.isArray(vs) || !VALUE_SOURCES.includes(vs.kind))
    throw err(400, `${at}: set_parameter needs value_source {kind: ${VALUE_SOURCES.join(" | ")}} — a value is written from a cited source, never a guess; a person types their own in Revit`);
  if (!cite) throw err(400, `${at}: the bridge read no standards to check this value_source — nothing is written unchecked`);
  return {
    parameter: el.parameter, revit_parameter: el.revit_parameter == null ? null : el.revit_parameter.trim(), from: el.from, to: el.to.replace(/^ +| +$/g, ""), // review C23: what makeCiter checked (ASCII trim), not JS trim()
    value_source: cite(el.kind, place, el.parameter, el.to, vs, at),
  };
}

/** Validate + normalise a proposed changeset. Assigns proposal_guids (a posted one is ignored); a missing
 *  validate.identity.GlobalId is synced to the proposal_guid so adjudication failures (tagged by
 *  GlobalId) map back to the element that earned them. Each element comes back with its op, target and reason, and
 *  the changeset with its exceptions (the elements a planner sent to a person). The element is rebuilt field by field,
 *  so a field added to the shape must be added here and to ELEMENT_FIELDS, or it is listed under `ignored` and not kept.
 *  MA-1a item 8: each element also comes back with the bridge's pretick and accuracy, and the changeset with claimed
 *  and the list of what was ignored.
 *  MA-2a (full contract 2): with `type` — the typer changesets-typing.makeTyper builds from the project's guideline and
 *  catalogue — a create or retype without place.TypeName is typed from its facts (TypeName, and FamilyName for a point kind,
 *  filled; `typing` says the bridge did it and from what), or refused in the typer's words; without one it is the 400 it was.
 *  Every element carries `typing` ({typed_by: "caller"} for one that named its type); a bridge-typed one is never pre-ticked.
 *  MA-2c: with `cite` — changesets-typing.makeCiter over the project's type catalogue and ids@n — a set_parameter's value_source is
 *  checked and replaced by the bridge's own record; without one a set_parameter is a 400.
 *  MA-4d: with `job` — {record, byCid}, built by changesets-store proposeFromJob from a job trustedJob accepted, never from a body (the
 *  route calls proposeChangeset, which passes none) — each element takes the job's measured block, its trims, accuracy and pre-tick from the
 *  bridge's record by cid, and the changeset is not claimed and carries the job as `job`. */
export function validateChangeset(body, { member = false, type = null, cite = null, job = null } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw err(400, "a changeset must be an object");
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw err(400, "name is required — a changeset is reviewed by humans and needs a human-readable name");
  if (!Array.isArray(body.elements) || !body.elements.length) throw err(400, "elements must be a non-empty array");
  if (body.elements.length > MAX_CHANGESET_ELEMENTS) throw err(413, `too many elements (${body.elements.length}; limit ${MAX_CHANGESET_ELEMENTS})`);

  // MA-1a item 8: the bridge, not the caller, sets the trust fields. Every posted field it does not keep is listed back
  // with the reason — a trust field, an unbacked measurement, or a field this bridge does not read — never dropped silently.
  const ignored = [];
  // The field is the caller's own key text: listed as one line of at most 200 characters, like every other caller text here.
  const note = (field, why) => ignored.push({ field: String(field).replace(/[\u0000-\u001f]/g, " ").slice(0, 200), why });
  // A trust field or a measurement under any spelling of its case ("Pretick"), and why it is not kept; else null.
  const trustWhy = (k) => (TRUST_FIELDS.includes(k.toLowerCase()) ? SET_BY_BRIDGE : k.toLowerCase() === "measured" ? NOT_MEASURED : null);
  const isBlock = (b) => !!b && typeof b === "object" && !Array.isArray(b);
  // A block kept whole (validate.identity, a pset or quantity entry: IFC data) without its trust fields; `nested` lists them.
  const untrusted = (b) => (isBlock(b) ? Object.fromEntries(Object.entries(b).filter(([k]) => !trustWhy(k))) : b);
  // Review amendment C3: the same one level down. `kept` = the names a block is rebuilt from; null = the block is kept
  // whole but for a trust field or a measurement (validate.identity: the IFC attributes adjudication reads).
  const nested = (block, kept, where) => {
    if (!isBlock(block)) return;
    for (const k of Object.keys(block)) {
      if (kept ? kept.includes(k) : !trustWhy(k)) continue;
      note(`${where}.${k}`, trustWhy(k) ?? NOT_KEPT);
    }
  };
  for (const k of Object.keys(body)) {
    if (TRUST_FIELDS.includes(k)) note(k, SET_BY_BRIDGE);
    else if (!BODY_FIELDS.includes(k)) note(k, NOT_KEPT);
  }
  if (body.contract != null && body.contract !== 1 && body.contract !== 2) throw err(400, "contract must be 1 or 2");
  const source = sourceOf(body.source, note);

  const seen = new Set(); // (op, element) pairs: one ghost per change, so a wall can carry one retype and one attach
  const elements = body.elements.map((el, i) => {
    const at = `elements[${i}]`;
    if (!el || typeof el !== "object") throw err(400, `${at}: must be an object`);
    for (const k of Object.keys(el)) {
      if (TRUST_FIELDS.includes(k)) note(`${at}.${k}`, SET_BY_BRIDGE);
      else if (k === "measured") note(`${at}.${k}`, NOT_MEASURED);
      else if (!ELEMENT_FIELDS.includes(k)) note(`${at}.${k}`, NOT_KEPT);
    }
    nested(el.place, PLACE_KEPT, `${at}.place`);
    nested(el.place?.LocationCurve, CURVE_KEPT, `${at}.place.LocationCurve`);
    nested(el.target, TARGET_KEPT, `${at}.target`);
    nested(el.validate, VALIDATE_KEPT, `${at}.validate`);
    nested(el.validate?.identity, null, `${at}.validate.identity`);
    nested(el.value_source, ["kind"], `${at}.value_source`); // MA-2c: the bridge writes the rest of the record itself
    const op = el.op ?? "create";
    if (!OPS.includes(op)) throw err(400, `${at}: op "${op}" is not supported — allowed: ${OPS.join(", ")}`);
    if (!OP_KINDS[op].includes(el.kind)) throw err(400, `${at}: kind "${el.kind}" is not supported${op === "create" ? "" : ` for ${op}`} — allowed: ${OP_KINDS[op].join(", ")}`);
    const validate = el.validate && typeof el.validate === "object" ? el.validate : {};
    if (!validate.identity || typeof validate.identity.Class !== "string" || !validate.identity.Class)
      throw err(400, `${at}: validate.identity.Class is required (the IFC class adjudication reads)`);
    // Review amendment C3: rebuilt from the names the add-in reads — a posted place.pretick or place.measured is not stored.
    const place = Object.fromEntries(Object.entries(isBlock(el.place) ? el.place : {}).filter(([k]) => PLACE_KEPT.includes(k)));
    // MA-2a: the poster's facts, checked and kept name for name; an attach types nothing, so it takes none.
    const facts = checkFacts(el.facts, at);
    if (facts && (op === "attach" || op === "set_parameter")) throw err(400, `${at}: ${op} takes no facts — nothing is typed`);
    // MA-2c: a set_parameter's own fields ride on no other op — each would be dropped silently.
    if (op !== "set_parameter")
      for (const f of ["parameter", "revit_parameter", "from", "to", "value_source"])
        if (el[f] !== undefined) throw err(400, `${at}: ${op} takes no ${f} — only a set_parameter writes a value`);
    let written = null; // a set_parameter's checked fields
    let typed = null; // the bridge's typing of this element, when it had to type it
    const typeIt = () => {
      typed = type(el.kind, facts, at); // a 400 in the typer's words when it cannot
      place.TypeName = typed.TypeName;
      if (POINT_KINDS.includes(el.kind) && !text(place.FamilyName, 256) && text(typed.FamilyName, 256)) place.FamilyName = typed.FamilyName;
    };
    let target = null;
    if (op === "create") {
      checkPlace(el.kind, el.place, at);
      // After checkPlace, so a geometry error still reads as one. The Revit executor refuses an empty type too.
      if (el.kind !== "level" && el.kind !== "grid" && !text(place.TypeName, 256)) {
        if (!type) throw err(400, `${at}: a ${el.kind} needs place.TypeName — Sentinel never takes the model's first type`);
        typeIt();
      }
      if (POINT_KINDS.includes(el.kind) && !text(place.FamilyName, 256))
        throw err(400, `${at}: a ${el.kind} needs place.FamilyName — a type name alone is not one type`);
      if (["roof", "ceiling", ...POINT_KINDS].includes(el.kind) && !text(place.LevelName, 256))
        throw err(400, `${at}: a ${el.kind} needs place.LevelName — Sentinel never picks its level`);
      // Drill MA2a (F-MA2a-3): a wall or floor names its level too. The executor read only LevelName for a create and put the
      // design's contract-2 wall (BaseLevel and TopLevel, design :675) on the model's lowest level, in silence. Contract 2's
      // BaseLevel names a wall's level and TopLevel its top; two names for one end are refused, never chosen between.
      if (el.kind === "wall" || el.kind === "floor") {
        for (const f of ["BaseLevel", "TopLevel"])
          if (place[f] !== undefined && !text(place[f], 256)) throw err(400, `${at}: place.${f} must be text of at most 256 characters`);
        const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
        const named = text(place.LevelName, 256) || (el.kind === "wall" && text(place.BaseLevel, 256)) || place.BaseElevation !== undefined;
        if (!named) throw err(400, el.kind === "wall"
          ? `${at}: a wall needs place.LevelName or place.BaseLevel (or place.BaseElevation) — Sentinel never picks its level`
          : `${at}: a floor needs place.LevelName (or place.BaseElevation) — Sentinel never picks its level`);
        if (el.kind === "wall") {
          if (text(place.LevelName, 256) && text(place.BaseLevel, 256) && !same(place.LevelName, place.BaseLevel))
            throw err(400, `${at}: place.LevelName and place.BaseLevel name different levels — send one`);
          if (place.TopLevel !== undefined && place.TopElevation !== undefined)
            throw err(400, `${at}: place.TopLevel and place.TopElevation say the same thing twice — send one`);
          const base = text(place.BaseLevel, 256) ? place.BaseLevel : place.LevelName;
          if (text(place.TopLevel, 256) && text(base, 256) && same(place.TopLevel, base))
            throw err(400, `${at}: place.TopLevel is the wall's own base level — name the level its top reaches`);
        }
      }
    } else {
      const uid = el.target?.unique_id;
      if (typeof uid !== "string" || !UNIQUE_ID.test(uid)) throw err(400, `${at}: ${op} needs target.unique_id, a Revit UniqueId`);
      const before = el.target.type_before ?? null;
      if (before !== null && !text(before, 256)) throw err(400, `${at}: target.type_before must be text of at most 256 characters`);
      const p = el.place && typeof el.place === "object" ? el.place : {};
      // A create's place fields ride on no retype or attach: the add-in would ignore them, and reads each into a typed field,
      // so one of the wrong type would fail every review in the project. A door's or window's retype names its family.
      for (const f of Object.keys(PLACE_FIELDS))
        if (p[f] !== undefined && !(f === "FamilyName" && (op === "retype" || op === "set_parameter") && PLACE_FIELDS.FamilyName.includes(el.kind)))
          throw err(400, `${at}: ${op} takes no place.${f} — only a create sets it`);
      if (op === "set_parameter") {
        if (before !== null) throw err(400, `${at}: set_parameter takes no target.type_before — its stale guard is from`);
        written = checkWrite(el, place, at, cite);
      }
      if (op === "retype" && !text(place.TypeName, 256)) {
        if (!type) throw err(400, `${at}: retype needs place.TypeName`);
        typeIt();
      }
      if (op === "retype" && (el.kind === "door" || el.kind === "window") && !text(place.FamilyName, 256))
        throw err(400, `${at}: a ${el.kind} retype needs place.FamilyName — a type name alone is not one type`);
      if (op === "attach" && (!text(p.BaseLevel, 256) || !text(p.TopLevel, 256) || p.BaseLevel === p.TopLevel))
        throw err(400, `${at}: attach needs two different levels, place.BaseLevel and place.TopLevel`);
      // MA-2c: one set_parameter per type and parameter.
      const k = `${op}:${uid.toLowerCase()}` + (written ? `:${written.parameter.toLowerCase()}` : "");
      if (seen.has(k)) throw err(400, `${at}: a second ${op} for the same element` + (written ? ` and ${written.parameter}` : ""));
      seen.add(k);
      // MA-3d: the element's IFC GlobalId, when the add-in sends it — the web desk highlights the ghost's element in the loaded model by it.
      // Optional (a changeset filed by an older add-in has none); a malformed one is a 400 in words; it is kept as sent, never derived.
      const guid = el.target.ifc_guid ?? null;
      if (guid !== null && (typeof guid !== "string" || !IFC_GUID.test(guid))) throw err(400, `${at}: target.ifc_guid must be an IFC GlobalId — 22 characters of its alphabet — when it is sent`);
      target = { unique_id: uid, type_before: before, ...(guid ? { ifc_guid: guid } : {}) };
    }
    if (el.reason != null && !text(el.reason, 500)) throw err(400, `${at}: reason must be text of at most 500 characters`);
    if (validate.psets !== undefined && !Array.isArray(validate.psets)) throw err(400, `${at}: validate.psets must be an array`);
    if (validate.quantities !== undefined && !Array.isArray(validate.quantities)) throw err(400, `${at}: validate.quantities must be an array`);
    if (el.cid != null && (!text(el.cid, 256) || CONTROL_CHAR.test(el.cid)))
      throw err(400, `${at}: cid must be one line of text of at most 256 characters`);
    if (el.evidence != null && (!Array.isArray(el.evidence) || el.evidence.length > MAX_EVIDENCE || el.evidence.some((x) => !text(x, 256) || CONTROL_CHAR.test(x))))
      throw err(400, `${at}: evidence must be a list of at most ${MAX_EVIDENCE} one-line texts of at most 256 characters each`);
    // MA-4d: an element the bridge built from a survey job it trusts (proposeFromJob) — its trust record, by cid; the body was the bridge's.
    const fromJob = job ? job.byCid.get(el.cid?.trim()) : null;
    if (job && !fromJob) throw err(400, `${at}: ${el.cid ?? "an element"} is not a candidate of ${job.record.id} — nothing was saved`);
    const provenance = checkProvenance(el.provenance, op, at);
    const proposal_guid = randomUUID();
    // The IFC attributes adjudication reads, kept whole — but never a trust field or a measurement (listed by `nested`).
    const identity = untrusted(validate.identity);
    // A pset or a quantity entry is IFC data, kept as sent — but for a trust field or a measurement on it, which is listed.
    const entries = (list, where) => (list || []).map((x, j) => { nested(x, null, `${at}.validate.${where}[${j}]`); return untrusted(x); });
    // The curve too is rebuilt from the names the add-in reads (start, end, an arc's mid): a key inside it is listed, not stored.
    if (isBlock(place.LocationCurve)) place.LocationCurve = Object.fromEntries(Object.entries(place.LocationCurve).filter(([k]) => CURVE_KEPT.includes(k)));
    if (!identity.GlobalId) identity.GlobalId = proposal_guid;
    // Review amendment C2 (MA-2c): a set_parameter's validate is the bridge's — the class from its kind, one pset row from parameter
    // and to — so the referee judges the value Revit will write; a posted psets, quantities or other class is listed, never judged.
    if (written) {
      for (const f of ["psets", "quantities"]) if (validate[f] !== undefined) note(`${at}.validate.${f}`, "ignored: set by the bridge from parameter and to");
      if (String(identity.Class).toUpperCase() !== KIND_ENTITY[el.kind]) { note(`${at}.validate.identity.Class`, "ignored: set by the bridge from kind"); identity.Class = KIND_ENTITY[el.kind]; }
    }
    const [pset, prop] = written ? written.parameter.split(".") : [];
    return {
      proposal_guid,
      kind: el.kind,
      op, target, reason: el.reason ?? null,
      validate: written ? { identity, psets: [{ name: pset, rows: [{ name: prop, value: written.to }] }], quantities: [] }
        : { identity, psets: entries(validate.psets, "psets"), quantities: entries(validate.quantities, "quantities") },
      place,
      ...(written ?? {}), // MA-2c: a set_parameter's parameter, from, to and the bridge's value_source
      ...(provenance ? { provenance } : {}), // MA-1a item 4: only when sent, so every other changeset reads as before
      // MA-2a: the poster's facts as a record, and the bridge's own account of who typed the element — its rule, its input,
      // and which guideline and catalogue decided — or "caller" for an element that named its type.
      ...(facts ? { facts } : {}),
      typing: typed ? typed.typing : { typed_by: "caller" },
      // Review amendment C4: contract 2's reader id and evidence ids, as sent — the caller's claim, like the source.
      ...(el.cid != null ? { cid: el.cid.trim() } : {}),
      ...(el.evidence != null ? { evidence: el.evidence.map((x) => x.trim()) } : {}),
      ...(fromJob ? { measured: fromJob.measured, ...(fromJob.trim_mm ? { trim_mm: fromJob.trim_mm } : {}) } : {}),
      // MA-1a item 8: the bridge's own trust decisions; a body's element is never measured. MA-2a: an element the bridge typed from
      // POSTED facts is never pre-ticked for that (the poster's claim). MA-4d: one it built from a job carries the job's decision — its
      // facts are the measurement the bridge re-hashed (survey-plan's trust record).
      pretick: fromJob ? fromJob.pretick : typed ? false : pretickOf(op, source, target, member),
      accuracy: fromJob ? fromJob.accuracy : { status: "not_measured" },
    };
  });

  const exceptions = checkExceptions(body.exceptions, (k, at) => note(`${at}.${k}`, trustWhy(k) ?? NOT_KEPT));
  const more = ignored.length - MAX_IGNORED;
  return {
    name, source,
    elements, exceptions,
    // The source is the caller's claim, unless the bridge built the changeset from a survey job it ran (MA-4d).
    claimed: !job,
    ignored: more > 0 ? [...ignored.slice(0, MAX_IGNORED), { field: "…", why: `${more} more field(s) ignored the same way` }] : ignored,
    ...(job ? { job: job.record } : {}),
    ...(body.contract != null ? { contract: body.contract } : {}),
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
function checkExceptions(rows, extra) {
  if (rows == null) return [];
  if (!Array.isArray(rows)) throw err(400, "exceptions must be an array");
  if (rows.length > MAX_CHANGESET_EXCEPTIONS) throw err(400, `too many exceptions (${rows.length}; limit ${MAX_CHANGESET_EXCEPTIONS})`);
  return rows.map((x, i) => {
    const at = `exceptions[${i}]`;
    if (!x || typeof x !== "object") throw err(400, `${at}: must be an object`);
    if (!text(x.unique_id, 64)) throw err(400, `${at}: unique_id is required (at most 64 characters)`);
    if (!text(x.reason, 300)) throw err(400, `${at}: reason is required (at most 300 characters)`);
    if (x.name != null && !text(x.name, 256)) throw err(400, `${at}: name must be text of at most 256 characters`);
    for (const k of Object.keys(x)) if (!["unique_id", "name", "reason"].includes(k)) extra(k, at); // listed, not kept
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

// ── MA-3a: the review states of design §6.6, one per ghost — the web desk's half (Revit's tick, apply and revert are its result and
//    its changeset_reverted rows). A ghost's `review` is absent while nobody decided: proposed. A web decline BINDS: Revit shows the
//    ghost unticked with the reason and refuses the tick, and the bridge refuses a result that applies a decline Revit had seen. A web
//    accept is advice. Only a lead re-opens a decline (founder decision D17). Nothing is decided once the changeset is not proposed.
//    `review_rev` counts the doc's writes: every write bumps it and swaps on it (changesets-store), and Revit sends the one it re-checked.
export const REVIEW_STATES = ["proposed", "accepted", "declined"];
export const MAX_REVIEW_REASON = 500;

/** A ghost's review state: its review's, else proposed. */
export const reviewState = (el) => el?.review?.state ?? "proposed";
/** The changeset's review revision; 0 on a doc from before MA-3a. */
export const reviewRev = (cs) => (Number.isInteger(cs?.review_rev) ? cs.review_rev : 0);
/** A ghost as the desk, the ledger and Revit's refusals name it: `retype wall "W 1"`. */
const ghostName = (el) => `${el.op ?? "create"} ${el.kind} "${el.validate?.identity?.Name ?? el.proposal_guid}"`;

/** The state `action` (accept | decline | reopen) takes a ghost in `state` to, or a 409 in words. */
export function reviewNext(state, action) {
  if (action === "reopen") {
    if (state === "declined") return "proposed";
    throw err(409, `only a declined ghost can be re-opened (this one is ${state})`);
  }
  const to = action === "accept" ? "accepted" : "declined";
  if (state === to) throw err(409, `this ghost is already ${state}`);
  if (state === "declined") throw err(409, "this ghost is declined — only a lead may re-open it, then it can be accepted");
  return to;
}

/** A reason as the ledger keeps it: trimmed, one line, at most MAX_REVIEW_REASON characters; null when blank and not needed. */
function reasonOf(r, need, what) {
  // Review amendment C9: blank is blank to the eye (a zero-width space too); one line refuses every control character and line break.
  if (r == null || (typeof r === "string" && r.replace(/[\s\p{Cf}]/gu, "") === "")) {
    if (need) throw err(400, `${what} needs a reason — the ledger records it and Revit shows it`);
    return null;
  }
  if (typeof r !== "string" || r.length > MAX_REVIEW_REASON || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(r)) throw err(400, `a reason is one line of at most ${MAX_REVIEW_REASON} characters`);
  return r.trim();
}

const proposedOnly = (cs) => {
  if (cs.status !== "proposed") throw err(409, `changeset is ${cs.status} — the web desk decides only while it is proposed`);
};

/** The web desk's decisions on one changeset — [{proposal_guid, decision: accept | decline, reason}] — all or none. `who` is {by, role,
 *  at}. Answers the changeset as it is to be stored (each decided ghost's review, the revision bumped) and one ledger entry per ghost. */
export function applyDecisions(cs, decisions, who) {
  proposedOnly(cs);
  if (!Array.isArray(decisions) || !decisions.length || decisions.length > MAX_CHANGESET_ELEMENTS)
    throw err(400, `decisions must be 1–${MAX_CHANGESET_ELEMENTS} entries`);
  const byGuid = new Map(cs.elements.map((e) => [e.proposal_guid, e]));
  const rev = reviewRev(cs) + 1;
  const next = new Map();
  const rows = [];
  for (const [i, x] of decisions.entries()) {
    const g = x?.proposal_guid;
    if (typeof g !== "string" || !byGuid.has(g)) throw err(400, `decisions[${i}]: unknown proposal_guid "${g}"`);
    if (next.has(g)) throw err(400, `proposal_guid "${g}" appears twice in the decisions`);
    if (x.decision !== "accept" && x.decision !== "decline") throw err(400, `decisions[${i}].decision must be accept or decline`);
    const el = byGuid.get(g);
    const from = reviewState(el);
    let to;
    try { to = reviewNext(from, x.decision); } catch (e) { throw err(e.status, `${ghostName(el)}: ${e.message}`); }
    const reason = reasonOf(x.reason, x.decision === "decline", "a decline");
    next.set(g, { state: to, action: x.decision, reason, by: who.by, role: who.role, at: who.at, rev });
    rows.push({ proposal_guid: g, name: ghostName(el), from, to, reason });
  }
  const elements = cs.elements.map((e) => (next.has(e.proposal_guid) ? { ...e, review: next.get(e.proposal_guid) } : e));
  return { updated: { ...cs, updated_at: who.at, review_rev: rev, elements }, rows };
}

/** A lead re-opens one declined ghost: proposed again, with the lead's reason. Answers the changeset to store and the ledger entry
 *  (what it re-opened: who declined it and why). The role is the store's check. */
export function reopenDecline(cs, guid, reason, who) {
  proposedOnly(cs);
  const el = cs.elements.find((e) => e.proposal_guid === guid);
  if (!el) throw err(400, `unknown proposal_guid "${guid}"`);
  try { reviewNext(reviewState(el), "reopen"); } catch (e) { throw err(e.status, `${ghostName(el)}: ${e.message}`); }
  const why = reasonOf(reason, true, "a re-open");
  const rev = reviewRev(cs) + 1;
  const review = { state: "proposed", action: "reopen", reason: why, by: who.by, role: who.role, at: who.at, rev };
  const elements = cs.elements.map((e) => (e === el ? { ...e, review } : e));
  return {
    updated: { ...cs, updated_at: who.at, review_rev: rev, elements },
    row: { proposal_guid: guid, name: ghostName(el), declined_by: el.review.by, declined_reason: el.review.reason, reason: why,
      ...(el.review.carried_from ? { carried_from: el.review.carried_from } : {}) }, // MA-3b3: the ledger says a carried decline was re-opened
  };
}

/** Revit's result against the web's declines (Q2). `seen` is the review_rev Revit re-checked before Apply (a claim the bridge cannot
 *  verify). Applying a ghost declined at or before `seen` is refused — Revit showed it declined and refuses that tick, so a client
 *  that did not is refused and said. One declined after `seen` was applied over a decline Revit could not see: recorded (late) and
 *  said. No `seen` at all (an add-in before MA-3a, a script — review amendment C2): the bridge cannot tell whether the decline was
 *  seen, so each applied decline is `unchecked` — recorded, never refused, never called late. Declined ghosts the result rejects are
 *  listed with the web's reason. */
export function resultConflicts(cs, appliedGuids, rejectedGuids, seen) {
  const none = seen == null;
  if (!none && (!Number.isInteger(seen) || seen < 0 || seen > reviewRev(cs)))
    throw err(400, `review_rev must be the review revision Revit re-checked (0–${reviewRev(cs)})`);
  const byGuid = new Map(cs.elements.map((e) => [e.proposal_guid, e]));
  const entry = (g) => {
    const e = byGuid.get(g);
    if (reviewState(e) !== "declined") return null;
    return { proposal_guid: g, name: ghostName(e), by: e.review.by, role: e.review.role, reason: e.review.reason, rev: e.review.rev,
      ...(e.review.carried_from ? { carried_from: e.review.carried_from } : {}) }; // MA-3b3: a carried decline says where it was made
  };
  const refused = [], late = [], unchecked = [], declinedOnWeb = [];
  // MA-3b3 (C6): a carried decline was on the filing's 201 reply — every result saw it, with or without a review_rev: refused.
  for (const g of appliedGuids) { const x = entry(g); if (x) (x.carried_from ? refused : none ? unchecked : x.rev <= seen ? refused : late).push(x); }
  for (const g of rejectedGuids) { const x = entry(g); if (x) declinedOnWeb.push(x); }
  return { refused, late, unchecked, declined_on_web: declinedOnWeb };
}

/** MA-3b2: Revit's reason per declined ghost — the result's optional `reasons` {proposal_guid: text}. Each key is a ghost this result
 *  rejects; each value is one line (reasonOf, the web desk's rule). A blank one is dropped; none left is null (nothing is stored). A
 *  reason for a ghost the web also declined is kept beside the web's (declined_on_web): refusing it would refuse a result Revit has
 *  already applied, over a decline that landed while its report was on the way. */
export function resultReasons(rejectedGuids, reasons) {
  if (reasons == null) return null;
  if (typeof reasons !== "object" || Array.isArray(reasons)) throw err(400, "reasons must be {proposal_guid: reason} — one line for each ghost this result rejects");
  const rejected = new Set(rejectedGuids);
  const out = Object.create(null); // review C9: `out["__proto__"] = …` on a plain object would be swallowed
  for (const [g, r] of Object.entries(reasons)) {
    if (!rejected.has(g)) throw err(400, `reasons names "${g}", which this result does not reject — a reason is for a declined ghost`);
    const why = reasonOf(r, false, "a decline");
    if (why != null) out[g] = why;
  }
  return Object.keys(out).length ? { ...out } : null;
}

// ── MA-3b3: a decline carried forward (founder decision: option A — the bridge stamps it at filing). A ghost that proposes the same
//    change as one declined before on the project is filed already declined, with the earlier decline's words, who made it and the
//    changeset it came from (review.carried_from). The match is the bridge's, on what it stored — never a posted claim. Revit and the
//    web desk read the stamp as any decline: unticked and locked; a lead re-opens it on the web desk.

/** What a ghost changes, as one text — the element, the op and what it sets: a retype's type (and family), an attach's two levels, a
 *  set_parameter's parameter and value. The UniqueId is compared in lower case (validateChangeset's own rule); a type's, a family's
 *  and a level's name too (C13: the add-in resolves each by name case-insensitively — ChangesetExecutor's OrdinalIgnoreCase — so
 *  "bds_ext_arc_cmu_200 MM" IS the declined type in Revit); a value as stored. Null for a create (it names no existing element) and
 *  for anything not whole: such a ghost is never matched, so never carried. */
export function carryKey(el) {
  const uid = el?.target?.unique_id, p = el?.place ?? {};
  if (typeof uid !== "string" || uid === "") return null;
  const one = (s) => (typeof s === "string" && s.trim() !== "" ? s.trim() : null);
  const name = (s) => one(s)?.toLowerCase() ?? null;
  const head = [el.op, el.kind, uid.toLowerCase()];
  if (el.op === "retype") return name(p.TypeName) ? JSON.stringify([...head, name(p.TypeName), name(p.FamilyName)]) : null;
  if (el.op === "attach") return name(p.BaseLevel) && name(p.TopLevel) ? JSON.stringify([...head, name(p.BaseLevel), name(p.TopLevel)]) : null;
  if (el.op === "set_parameter") return one(el.parameter) && typeof el.to === "string" ? JSON.stringify([...head, name(el.parameter), el.to]) : null;
  return null;
}

/** MA-3b3 (C1): the role the bridge itself read for a result's reporter when the result came in (reportResult stores it as
 *  result.reported_role) — a member's role; null for the machine credential ("service": the MCP server, a script, a signed-out PC —
 *  its `reported_by` is whatever the caller posted) and for a result stored before MA-3b3 (no role stored). */
const reporterRole = (r) => (typeof r?.reported_role === "string" && r.reported_role !== "" && r.reported_role !== "service" ? r.reported_role : null);

/** MA-3b3 (C7): a create as far as it can be compared — its kind, type and level. Never a match (a create names no existing element):
 *  only whether a create like it was declined before, so that is said. */
const createLike = (el) => JSON.stringify([el?.kind ?? null, el?.place?.TypeName ?? null, el?.place?.LevelName ?? el?.place?.BaseLevel ?? null]);

/** The elements of a new filing, each stamped with the decline that stands for the same change on the project. `earlier` is every
 *  changeset the project holds (any status). Each earlier ghost gives ONE decision, with the time it was made (C2: a web decline's or
 *  a re-open's review.at, a result's reported_at; the changeset's created_at only when that time is missing); the decisions are
 *  sorted by that time — never by when their changesets were filed — and the NEWEST decision on a change stands (the same moment: a
 *  decline before a clear, so the clear stands):
 *    · applied since (in a result's applied list) — nothing stands; unless the bridge itself recorded that apply as made OVER a
 *      standing decline (the result's applied_over_late_decline or applied_over_decline_unchecked — C12): then the decline, a
 *      person's decision, stands and is carried. Revit was told of such an apply with the Undo hint, and an Undo writes no doc
 *      field (reportReverted is a ledger row), so the apply is never the office's word that the decline is void;
 *    · declined on the web and not re-opened — carried (the web's reason, reviewer, role and time);
 *    · rejected by Revit with a reason for that ghost (result.reasons), reported by a signed-in member (C1: result.reported_role is
 *      a member's role) — carried (that reason, the reporter, that role, the report's time);
 *    · the same, reported by the machine credential or with no role stored — NOT carried and counted (`unverified`): under the
 *      machine credential the reporter's name is the caller's claim, and a binding decline is a signed-in person's;
 *    · re-opened by a lead — nothing stands (a re-opened decline is not carried);
 *    · rejected by Revit with no reason of its own — NOT carried and counted (`no_reason`): the stored result cannot tell a row a
 *      person unticked from an element Revit removed at commit or an Apply that rolled back (all three are `rejected`).
 *  Neither count ever replaces a decline that stands. A decline already carried keeps its first origin and its first time
 *  (carried_from is copied, never chained), so a later re-open of the origin outranks every copy. A carried review is at rev 0 — the
 *  revision the changeset is filed at — and a result that applies it is refused (resultConflicts).
 *  `creates` (C7): the creates of this filing of the same kind, type and level as a create declined before and not applied by its
 *  changeset — none can be matched, and that is said.
 *  Answers {elements, carried: [{proposal_guid, name, origin, from, from_name, from_guid}], no_reason, creates, unverified}. Pure. */
export function carryDeclines(elements, earlier) {
  const events = []; // one decision per earlier ghost: {key, at, review} | {key, at, clear} | {key, at, unsaid} | {key, at, unverified}
  const declinedCreates = new Set();
  for (const cs of earlier ?? []) {
    const r = cs?.result ?? null;
    const over = new Set([...(r?.applied_over_late_decline ?? []), ...(r?.applied_over_decline_unchecked ?? [])].map((x) => x?.proposal_guid)); // C12
    const applied = new Set((r?.applied ?? []).map((a) => a?.proposal_guid).filter((g) => !over.has(g)));
    const rejected = new Set(r?.rejected ?? []);
    const why = (g) => (r?.reasons && Object.prototype.hasOwnProperty.call(r.reasons, g) && typeof r.reasons[g] === "string" ? r.reasons[g] : null);
    const role = reporterRole(r);
    const at = (t) => String(t ?? cs?.created_at ?? "");
    for (const el of cs?.elements ?? []) {
      const g = el?.proposal_guid, key = carryKey(el);
      const web = reviewState(el) === "declined", reasoned = rejected.has(g) && why(g) != null;
      if (!key) { if (!el?.target && !applied.has(g) && (web || (reasoned && role))) declinedCreates.add(createLike(el)); continue; }
      const decline = (reason, by, as, when, origin) => ({ state: "declined", action: "decline", reason, by, role: as, at: when, rev: 0,
        carried_from: el.review?.carried_from ?? { changeset: cs.id, name: cs.name, proposal_guid: g, origin } });
      if (applied.has(g)) events.push({ key, at: at(r.reported_at), clear: true });
      else if (web) events.push({ key, at: at(el.review.at), review: decline(el.review.reason, el.review.by, el.review.role ?? null, el.review.at, "web") });
      else if (reasoned && role) events.push({ key, at: at(r.reported_at), review: { ...decline(why(g), r.reported_by ?? "an unknown account", role, r.reported_at ?? null, "revit"),
        carried_from: { changeset: cs.id, name: cs.name, proposal_guid: g, origin: "revit" } } }); // Revit's own, newer decline: its own origin
      else if (reasoned) events.push({ key, at: at(r.reported_at), unverified: true });
      else if (el.review?.action === "reopen") events.push({ key, at: at(el.review.at), clear: true });
      else if (rejected.has(g)) events.push({ key, at: at(r.reported_at), unsaid: true });
    }
  }
  // C2: by decision time (ISO text compares as time); the same moment: a decline before a clear. The sort is stable.
  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : (a.clear ? 1 : 0) - (b.clear ? 1 : 0)));
  const standing = new Map(); // carryKey → the newest decision; a count (unsaid, unverified) never replaces a decline that stands
  for (const e of events) if (e.review || e.clear || !standing.get(e.key)?.review) standing.set(e.key, e);
  const carried = [];
  let noReason = 0, unverified = 0, creates = 0;
  const out = (elements ?? []).map((el) => {
    const key = carryKey(el);
    if (!key) { if (!el?.target && declinedCreates.has(createLike(el))) creates++; return el; }
    const s = standing.get(key);
    if (s?.review) {
      const from = s.review.carried_from;
      carried.push({ proposal_guid: el.proposal_guid, name: ghostName(el), origin: from.origin, from: from.changeset, from_name: from.name, from_guid: from.proposal_guid });
      return { ...el, review: s.review };
    }
    if (s?.unsaid) noReason++;
    else if (s?.unverified) unverified++;
    return el;
  });
  return { elements: out, carried, no_reason: noReason, creates, unverified };
}

/** A decline in words, for a refusal: where it was made and by whom — and, for a carried one, the changeset it was carried from. An
 *  origin not known is "before" (C15: Revit's ReviewLine and the desk's declinedBy say the same), never guessed. */
export const declineWords = (r) => (r?.carried_from
  ? `declined ${r.carried_from.origin === "revit" ? "in Revit" : r.carried_from.origin === "web" ? "on the web" : "before"} by ${r.by}${r.role ? ` (${r.role})` : ""} in "${r.carried_from.name}" and carried here by the bridge`
  : `declined on the web by ${r?.by} (${r?.role})`);
