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
// MA-5b-1: room — a drawing's labelled room, placed at a point on its level; Revit finds its boundary there (no type, no family).
// MA-6-3 (vocabulary v2): opening — a rectangle cut in a wall, or a hole in a floor; beam — a straight structural framing member.
// MA-6-6 (MAS-2, D8): mass — a footprint between two elevations, placed as a DirectShape in Mass (Photo Massing's; Shell a Mass shells it).
// MA-8-10: stair — one straight run between two Building Stories, between two levels the model holds, of the office's stair type; built in Revit's own
// stair edit scope, so a stair changeset holds its stair and nothing else (the bridge never types it: checkPlace demands TypeName).
// MA-8-14: terrain — the ground of a survey as one Toposolid (Revit 2024 and later) of the office's Toposolid type, from points the add-in read off the scan
// (lowest per cell, outside the storey's box), around a hole of the storey's footprint; a terrain changeset holds its terrain and nothing else.
export const VOCABULARY = ["wall", "floor", "level", "grid", "roof", "ceiling", "door", "window", "column", "furniture", "room", "opening", "beam", "mass", "stair", "terrain"];
/** The kinds that take no type: a level and a grid are named, a room is named and numbered, an opening (MA-6-3) and a mass (MA-6-6) are their shape. */
export const UNTYPED = ["level", "grid", "room", "opening", "mass"];
/** MA-6-1: the IFC class the bridge sets from each kind — the Promote six (KIND_ENTITY, held to PromoteWallsPlanner.Classes by
 *  promote-check) and the rest of the vocabulary as the add-in files them (GhostFiling: IFCFURNITURE). A posted class that is not
 *  exactly this one is listed and replaced: an IDS entity pattern matches no subtype, so a chosen class could step outside a spec. */
export const CREATE_ENTITY = { ...KIND_ENTITY, level: "IFCBUILDINGSTOREY", grid: "IFCGRID", room: "IFCSPACE", column: "IFCCOLUMN", furniture: "IFCFURNITURE",
  opening: "IFCOPENINGELEMENT", beam: "IFCBEAM", // MA-6-3
  mass: "IFCBUILDINGELEMENTPROXY", // MA-6-6: what GovernedElementExtractor reads for OST_Mass (as_built counts it out_of_scope)
  stair: "IFCSTAIR", // MA-8-10: what GovernedElementExtractor reads for OST_Stairs (as_built counts it out_of_scope; the DD IDS asks nothing of it)
  terrain: "IFCGEOGRAPHICELEMENT" }; // MA-8-14: what Revit's IFC4 export makes of a Toposolid (IfcGeographicElement, .TERRAIN - the spike, K-1b)
/** What a ghost does. create places a new element (the v1 path); retype changes an EXISTING element's type, named by its
 *  Revit UniqueId (Promote) — a door or window keeps its host: ChangeTypeId to a symbol of the same category; attach re-tops
 *  an existing wall. An element without op is a create. MA-2c: set_parameter writes one value on an existing TYPE, named by its
 *  UniqueId, from a cited source the bridge checks (value_source) — [BP] P2-7's item, built once. MA-5b-5: rehost replaces a door or
 *  window no wall hosts (a level-based placeholder) with the office's wall-hosted type of its size in the wall it stands in — the old
 *  instance is removed in the same Undo step (the first element Sentinel removes): a signed-in member's (Promote), never pre-ticked. */
export const OPS = ["create", "retype", "attach", "set_parameter", "reshape", "rehost", "delete"];
/** The kinds each op takes. */
export const OP_KINDS = { create: VOCABULARY, retype: ["wall", "floor", "roof", "ceiling", "door", "window", "column", "beam"], attach: ["wall"], // MA-8-7: a structural column and a beam (by section)
  set_parameter: ["wall", "floor", "roof", "ceiling", "door", "window"], reshape: ["wall"], rehost: ["door", "window"],
  // Human-error guards §3 (spec 2026-10-21): a copy clash triage found modelled twice, removed in Revit only when it is the same as the one kept
  delete: ["wall", "floor", "roof", "ceiling", "door", "window", "column", "beam", "furniture"] };
/** MA-5b-5: the place fields a rehost takes — where its new instance goes (a point on its host wall's location line, on its level) and
 *  the office type it becomes; a window's sill. Its Mark is copied from the old instance; it is never turned (the office family's default). */
const REHOST_PLACE = ["LevelName", "Location", "FamilyName", "TypeName", "SillHeight"];
export const MAX_CHANGESET_ELEMENTS = 200;
export const MAX_CHANGESET_EXCEPTIONS = 1000;
export const MAX_BOUNDARY_POINTS = 256;
export const MAX_OFFSET_MM = 100000;

const err = (status, message) => Object.assign(new Error(message), { status });
// MA-6-3 review fix: "an opening", not "a opening", in the generic messages.
const a = (kind) => (/^[aeiou]/.test(kind) ? "an " : "a ") + kind;
const finite = (n) => typeof n === "number" && Number.isFinite(n);
const point = (p) => Array.isArray(p) && p.length === 3 && p.every(finite);
const text = (s, max) => typeof s === "string" && s.trim() !== "" && s.length <= max;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
export const TRUST_FIELDS = ["pretick", "accuracy", "confidence", "typing", "claimed", "proposal_guid", "foreign"]; // MA-8-7: foreign — the bridge judges a retype's type against the catalogue
/** The sources the Revit add-in files under (GhostFiling, PromoteWallsPlanner). The bridge cannot tell the add-in from
 *  another caller holding the same credential, so every changeset's source is a claim (claimed: true); the MCP tool never
 *  files as one of these. */
export const ADDIN_SOURCES = ["dwg", "promote", "photo"]; // MA-6-6: Photo Massing files its mass and levels as "photo"
const BODY_FIELDS = ["name", "source", "elements", "exceptions", "actor", "agent", "contract"]; // what a posted body is read for
// MA-2a: `facts` — the poster's thickness and parameters (Function, Location, Material, …), kept as a record and, on an element
// without place.TypeName, what the bridge types it from (changesets-typing).
// MA-2c: a set_parameter's parameter, the Revit parameter's name, the value the plan read (from), the value to write (to) and
// where it comes from (value_source — the bridge checks it and writes its own record).
const ELEMENT_FIELDS = ["kind", "op", "target", "reason", "validate", "place", "provenance", "cid", "evidence", "facts",
  "parameter", "revit_parameter", "from", "to", "value_source", "replaces", "from_flag", "from_scan"]; // what an element is rebuilt from (MA-8-10: a stair's from_flag; MA-8-14: a terrain's from_scan)
// Review amendment C3: what an element's blocks are rebuilt from. PLACE_KEPT is the add-in's PlaceDto (ChangesetClient.cs),
// name for name; a key added to one must be added to the other, or it is listed under `ignored` and not kept.
export const PLACE_KEPT = ["TypeName", "LevelName", "LocationCurve", "LocationLoop", "BaseElevation", "TopElevation", "Name", "BaseLevel", "TopLevel",
  "FamilyName", "Location", "SillHeight", "FlipFacing", "FlipHand", "Rotation", "Mirrored", "Boundary", "BaseOffset", "Offset", "Mark", "Structural", "Number",
  "Width", "Height", "Slopes", // MA-6-3: a wall opening's size; a roof's slope per edge
  "Risers", "Going", // MA-8-10: a stair's riser count and going (mm); its width is Width
  "Points"]; // MA-8-14: a terrain's ground points, [x, y, z] mm (z = the absolute model elevation); its footprint is Boundary
const TARGET_KEPT = ["unique_id", "type_before", "placed", "at", "ifc_guid", "keeper_ifc_guid"]; // MA-3d: ifc_guid; human-error guards §3: a delete's keeper
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
  FamilyName: ["door", "window", "column", "furniture", "beam", "stair", "terrain"], Mark: ["wall", "floor", "roof", "ceiling", "door", "window", "column", "furniture", "beam", "stair"],
  Structural: ["floor"], Location: ["door", "window", "column", "furniture", "room", "opening"], Number: ["room"], FlipFacing: ["door", "window"], FlipHand: ["door", "window"],
  SillHeight: ["window", "opening"], Boundary: ["roof", "ceiling", "opening", "mass", "terrain"], BaseOffset: ["roof"], Offset: ["ceiling"],
  // MA-1b (GHB-1): a drawn block's direction — the plan angle of its X axis and whether it is mirrored. The add-in flips the
  // placed instance to that hinge side and swing side (ChangesetExecutor), and measures what Revit holds after the commit.
  Rotation: ["door", "window"], Mirrored: ["door", "window"],
  // MA-6-3: a wall opening's size; a roof's slope per Boundary edge. TopLevel is not here (an attach needs it): the create branch checks it.
  Width: ["opening", "stair"], Height: ["opening"], Slopes: ["roof"],
  // MA-8-10: a stair's riser count and going. TopLevel is not here either: the create branch checks it for a stair too.
  Risers: ["stair"], Going: ["stair"],
  Points: ["terrain"], // MA-8-14
};
const STAIR_PLACE = ["LevelName", "TopLevel", "FamilyName", "TypeName", "LocationCurve", "Width", "Risers", "Going", "Mark"]; // MA-8-10: all a stair takes
const TERRAIN_PLACE = ["LevelName", "FamilyName", "TypeName", "Points", "Boundary"]; // MA-8-14: all a terrain takes
const MIN_TERRAIN_POINTS = 3, MAX_TERRAIN_POINTS = 2000, MAX_TERRAIN_SPAN_MM = 500000;
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase(); // names are compared as the executor reads them: case aside
// The point kinds: a family placed at place.Location on its level — a door or window in the one wall under it, a column or
// furniture unhosted (MA-1a step 2).
const POINT_KINDS = ["door", "window", "column", "furniture"];
// MA-6-3: the kinds whose type is a family's (place.FamilyName with TypeName): the point kinds and a beam on its line.
const FAMILY_KINDS = [...POINT_KINDS, "beam"];
const MAX_OPENING_MM = 20000; // MA-6-3: a wall opening's width, height and sill
const MAX_SLOPE_DEG = 75;
const MIN_MASS_MM = 100, MAX_MASS_MM = 1000000; // MA-6-6: a mass's height, TopElevation less BaseElevation

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

/** An outline's edges: its points less a closing one equal to the first (the executor's Outline reads it so). MA-6-3: a roof's
 *  Slopes has one entry per edge, Slopes[i] for Boundary[i]→[i+1]. */
const edgeCount = (b) => b.length - (b[0][0] === b.at(-1)[0] && b[0][1] === b.at(-1)[1] ? 1 : 0);

/** MA-1: a roof's or ceiling's outline in plan, [[x,y],…] mm, a closing point equal to the first allowed: why Revit could not
 *  sketch it as one simple closed loop, or null. Exact arithmetic on the numbers sent. ponytail: O(n²) pair test, fine at 256
 *  points x 200 elements; a sweep if outlines ever grow. */
export function outlineProblem(b) {
  if (!Array.isArray(b) || b.length < 3 || b.length > MAX_BOUNDARY_POINTS || !b.every(xy)) return `must be 3 to ${MAX_BOUNDARY_POINTS} finite [x,y] points`;
  const n = edgeCount(b);
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

/** MA-8-14: whether the plan point p is inside the first n vertices of the outline b (even-odd; an outline the checks above passed). */
function inside(b, n, p) {
  let c = false;
  for (let i = 0, j = n - 1; i < n; j = i++)
    if ((b[i][1] > p[1]) !== (b[j][1] > p[1]) && p[0] < ((b[j][0] - b[i][0]) * (p[1] - b[i][1])) / (b[j][1] - b[i][1]) + b[i][0]) c = !c;
  return c;
}

/** Per-kind geometry sanity. Deliberately shallow: real placement failures surface in Revit's
 *  transaction (and roll the whole changeset back) — this guards against garbage, not bad design. */
function checkPlace(kind, place, at) {
  if (!place || typeof place !== "object") throw err(400, `${at}: place is required`);
  // MA-8-10: a stair is one straight run between two levels - every other kept key is a 400 in its own words, before the generic ones.
  if (kind === "stair")
    for (const f of PLACE_KEPT)
      if (place[f] !== undefined && !STAIR_PLACE.includes(f)) throw err(400, `${at}: a stair takes no place.${f} — it is one straight run between two levels`);
  // MA-8-14: so is a terrain - a Toposolid of points around a hole, nothing else of the kept keys.
  if (kind === "terrain")
    for (const f of PLACE_KEPT)
      if (place[f] !== undefined && !TERRAIN_PLACE.includes(f)) throw err(400, `${at}: a terrain takes no place.${f} — it is its Points around the storey's Boundary, of the office's Toposolid type`);
  for (const [f, kinds] of Object.entries(PLACE_FIELDS))
    if (place[f] !== undefined && !kinds.includes(kind)) throw err(400, `${at}: ${a(kind)} takes no place.${f}`);
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
  // MA-6-3: a beam runs on a straight LocationCurve too (z = its top: Revit's default justification), never an arc.
  if (kind === "wall" || kind === "grid" || kind === "beam") {
    const c = place.LocationCurve;
    if (!c || !point(c.start) || !point(c.end)) throw err(400, `${at}: ${kind} needs place.LocationCurve with finite [x,y,z] start and end`);
    // Distinctness is near-free to check here; a zero-length curve would cost a whole-changeset
    // Revit transaction rollback (up to 200 elements) for trivially detectable garbage.
    if (c.start.every((v, i) => v === c.end[i])) throw err(400, `${at}: ${kind} LocationCurve start and end are identical (zero-length)`);
    // MA-6-3 review fix: a beam runs in plan — a vertical or sub-millimetre one is Revit's refusal at Apply, declining the whole changeset.
    if (kind === "beam" && Math.hypot(c.end[0] - c.start[0], c.end[1] - c.start[1]) < MIN_EDGE_MM)
      throw err(400, `${at}: a beam runs in plan — its LocationCurve start and end at least ${MIN_EDGE_MM} mm apart in x,y`);
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
  } else if (kind === "room") {
    // MA-5b-1: the point Revit finds the room's boundary at, its name and its number as drawn — each one line (Revit's Name and Number)
    if (!point(place.Location)) throw err(400, `${at}: a room needs place.Location, the finite [x,y,z] point inside its walls (z = its level's elevation)`);
    if (!text(place.Name, 256) || CONTROL_CHAR.test(place.Name)) throw err(400, `${at}: a room needs place.Name, its name: one line of at most 256 characters`);
    if (place.Number !== undefined && (!text(place.Number, 16) || CONTROL_CHAR.test(place.Number)))
      throw err(400, `${at}: place.Number must be one line of at most 16 characters — leave it out to have Revit number the room`);
  } else if (kind === "roof" || kind === "ceiling") {
    const why = outlineProblem(place.Boundary);
    if (why) throw err(400, `${at}: ${kind} place.Boundary ${why}`);
    const f = kind === "roof" ? "BaseOffset" : "Offset";
    if ((kind === "ceiling" || place[f] !== undefined) && !inRange(place[f], -MAX_OFFSET_MM, MAX_OFFSET_MM))
      throw err(400, `${at}: ${kind === "ceiling" ? "a ceiling needs " : ""}place.${f}, a number of mm within ±${MAX_OFFSET_MM}`);
    // MA-6-3: a pitched roof — one entry per Boundary edge, null where the edge defines no slope (a gable), else its pitch in degrees.
    if (place.Slopes !== undefined) {
      const n = edgeCount(place.Boundary);
      if (!Array.isArray(place.Slopes) || place.Slopes.length !== n)
        throw err(400, `${at}: place.Slopes needs one entry per Boundary edge (${n} here; Slopes[i] is Boundary[i]→[i+1]) — null for an edge with no slope, else degrees`);
      place.Slopes.forEach((s, i) => {
        if (s !== null && !(finite(s) && s > 0 && s <= MAX_SLOPE_DEG))
          throw err(400, `${at}: place.Slopes[${i}] must be null (the edge defines no slope) or degrees above 0 and at most ${MAX_SLOPE_DEG}`);
      });
    }
  } else if (kind === "opening") {
    // MA-6-3: exactly one shape — a rectangle cut in a wall (its middle on the wall's location line, as a door's point) or a hole in a
    // floor (its outline). Both, or neither, is a 400: the bridge never chooses which was meant.
    if ((place.Location !== undefined) === (place.Boundary !== undefined))
      throw err(400, `${at}: an opening is a rectangle in a wall (place.Location, Width, Height and SillHeight) or a hole in a floor (place.Boundary) — send exactly one of the two`);
    if (place.Location !== undefined) {
      if (!point(place.Location))
        throw err(400, `${at}: a wall opening needs place.Location, the finite [x,y,z] point at its middle on its host wall's location line (z = its level's elevation)`);
      for (const f of ["Width", "Height"])
        if (!(finite(place[f]) && place[f] > 50 && place[f] <= MAX_OPENING_MM)) throw err(400, `${at}: a wall opening needs place.${f}, a number of mm above 50 and at most ${MAX_OPENING_MM}`);
      if (!inRange(place.SillHeight, 0, MAX_OPENING_MM))
        throw err(400, `${at}: a wall opening needs place.SillHeight, its bottom above its level — a number of mm from 0 to ${MAX_OPENING_MM}`);
    } else {
      const why = outlineProblem(place.Boundary);
      if (why) throw err(400, `${at}: opening place.Boundary ${why}`);
      for (const f of ["Width", "Height", "SillHeight"])
        if (place[f] !== undefined) throw err(400, `${at}: a floor opening is its place.Boundary — it takes no place.${f}`);
    }
  } else if (kind === "stair") {
    // MA-8-10: one straight run, first riser to last, between two levels the add-in finds by name. The riser rule is Revit's (the type's maximum
    // riser, which only the model's StairsType holds), so the plan is made in Revit (StairPlanner) and the bridge holds the arithmetic it can see:
    // a run of N risers at a going G is (N - 1) x G long in plan (spike S1: N x G gives N + 1 risers and a top-end warning).
    if (!text(place.LevelName, 256) || !text(place.TopLevel, 256))
      throw err(400, `${at}: a stair needs place.LevelName (the level it rises from) and place.TopLevel (the level its top reaches) — Sentinel never picks its levels`);
    if (same(place.LevelName, place.TopLevel)) throw err(400, `${at}: place.TopLevel is the stair's own level — name the level its top reaches`);
    if (!text(place.FamilyName, 256) || !text(place.TypeName, 256))
      throw err(400, `${at}: a stair needs place.FamilyName and place.TypeName — the office's stair type (the guideline's Stairs rule); Sentinel never takes the model's first type`);
    const c = place.LocationCurve;
    if (!c || !point(c.start) || !point(c.end)) throw err(400, `${at}: a stair needs place.LocationCurve with finite [x,y,z] start and end — the run's centre line, first riser to last`);
    if (c.mid !== undefined) throw err(400, `${at}: a stair is one straight run — place.LocationCurve takes no mid`);
    if (Math.abs(c.end[2] - c.start[2]) > 1) throw err(400, `${at}: a stair's LocationCurve is level — start and end z within 1 mm (the rise is the two levels')`);
    if (!Number.isInteger(place.Risers) || place.Risers < 2 || place.Risers > 60) throw err(400, `${at}: a stair needs place.Risers, a whole number from 2 to 60`);
    if (!inRange(place.Going, 100, 1000)) throw err(400, `${at}: a stair needs place.Going, a number of mm from 100 to 1000`);
    if (!inRange(place.Width, 300, 5000)) throw err(400, `${at}: a stair needs place.Width, its run width, a number of mm from 300 to 5000`);
    const run = Math.hypot(c.end[0] - c.start[0], c.end[1] - c.start[1]), need = (place.Risers - 1) * place.Going;
    if (Math.abs(run - need) > 1)
      throw err(400, `${at}: the run is ${Math.round(run)} mm; ${place.Risers} risers at ${place.Going} mm going need ${need} mm ((risers − 1) × going)`);
  } else if (kind === "terrain") {
    // MA-8-14: the ground as one Toposolid. Revit triangulates the points in plan, so the refusals are the ones it would make at Apply (the spike, K-1b):
    // fewer than 3 points or all on one line throw, two within 1 mm merge silently. The Boundary is the storey's footprint, the hole the solid leaves.
    if (!text(place.LevelName, 256)) throw err(400, `${at}: a terrain needs place.LevelName — the level the Toposolid is created on; Sentinel never picks its level`);
    if (!text(place.TypeName, 256))
      throw err(400, `${at}: a terrain needs place.TypeName — the office's Toposolid type (the guideline's Toposolid rule); Sentinel never takes the model's first type`);
    if (place.FamilyName !== undefined && !text(place.FamilyName, 256)) throw err(400, `${at}: place.FamilyName must be text of at most 256 characters`);
    const pts = place.Points;
    if (!Array.isArray(pts) || pts.length < MIN_TERRAIN_POINTS || pts.length > MAX_TERRAIN_POINTS || !pts.every(point))
      throw err(400, `${at}: a terrain needs place.Points, ${MIN_TERRAIN_POINTS} to ${MAX_TERRAIN_POINTS} finite [x,y,z] points`);
    // review round 3: over the Points and the Boundary - Revit's outer loop runs round both (Compat.CreateTerrain), so points clustered far from the footprint make a solid that wide
    const plan = [...pts, ...(Array.isArray(place.Boundary) ? place.Boundary.filter((q) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1])) : [])];
    const span = Math.max(Math.max(...plan.map((p) => p[0])) - Math.min(...plan.map((p) => p[0])), Math.max(...plan.map((p) => p[1])) - Math.min(...plan.map((p) => p[1])));
    if (span > MAX_TERRAIN_SPAN_MM) throw err(400, `${at}: place.Points and place.Boundary span ${Math.round(span / 1000)} m in plan — a terrain is at most ${MAX_TERRAIN_SPAN_MM / 1000} m across`);
    const byX = [...pts.keys()].sort((i, j) => pts[i][0] - pts[j][0]);   // two points within 1 mm in plan: sweep by x
    for (let i = 0; i < byX.length; i++)
      for (let j = i + 1; j < byX.length && pts[byX[j]][0] - pts[byX[i]][0] < MIN_EDGE_MM; j++)
        if (Math.hypot(pts[byX[j]][0] - pts[byX[i]][0], pts[byX[j]][1] - pts[byX[i]][1]) < MIN_EDGE_MM)
          throw err(400, `${at}: place.Points[${Math.min(byX[i], byX[j])}] and [${Math.max(byX[i], byX[j])}] lie within ${MIN_EDGE_MM} mm of each other in plan — Revit merges them; send one`);
    const far = pts.reduce((m, p) => (Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) > Math.hypot(m[0] - pts[0][0], m[1] - pts[0][1]) ? p : m), pts[0]);
    const line = Math.hypot(far[0] - pts[0][0], far[1] - pts[0][1]);   // > 0: no two points coincide
    if (pts.every((p) => Math.abs(cross(pts[0], far, p)) / line < MIN_EDGE_MM))
      throw err(400, `${at}: place.Points lie on one line in plan — Revit cannot make a surface of them; send points that are not in a line`);
    const why = outlineProblem(place.Boundary);
    if (why) throw err(400, `${at}: terrain place.Boundary ${why} (the storey's footprint, the hole in the Toposolid)`);
    const n = edgeCount(place.Boundary);
    const hole = pts.findIndex((p) => inside(place.Boundary, n, p));
    if (hole >= 0) throw err(400, `${at}: place.Points[${hole}] lies inside the Boundary — ground is outside the storey's footprint`);
  } else if (kind === "mass") {
    // MA-6-6 (MAS-2): a footprint and two elevations, in the Level.Elevation frame (a level's BaseElevation's) — no level of its own: a
    // DirectShape has none, and Shell a Mass gives each storey its level (amendment 14: a LevelName would be kept and never applied).
    if (place.LevelName !== undefined) throw err(400, `${at}: a mass takes no place.LevelName — the shell gives each storey its level`);
    // MA-6-6 review fix: so is every other kept key a mass never reads (BaseLevel, Name, LocationCurve, LocationLoop) — kept, it would be shown
    // and never applied, and a mistyped curve or loop fails the add-in's read of the project's changesets. TypeName and TopLevel have their own words.
    for (const f of PLACE_KEPT)
      if (place[f] !== undefined && !["Boundary", "BaseElevation", "TopElevation", "TypeName", "TopLevel"].includes(f))
        throw err(400, `${at}: a mass takes no place.${f} — it is its Boundary between BaseElevation and TopElevation`);
    const why = outlineProblem(place.Boundary);
    if (why) throw err(400, `${at}: mass place.Boundary ${why}`);
    for (const f of ["BaseElevation", "TopElevation"])
      if (!finite(place[f])) throw err(400, `${at}: a mass needs place.${f}, a finite number of mm (the levels' elevation frame, as a level's BaseElevation)`);
    const h = place.TopElevation - place.BaseElevation;
    if (!(h >= MIN_MASS_MM && h <= MAX_MASS_MM))
      throw err(400, `${at}: a mass's place.TopElevation is ${MIN_MASS_MM} to ${MAX_MASS_MM} mm above its place.BaseElevation (got ${h} mm)`);
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
const pretickOf = (op, source, target, member, foreign = null, kind = null) =>
  member === true && source === "promote" && (op === "attach" || (op === "retype" && target?.type_before != null && foreign === false && kind !== "column" && kind !== "beam"));

// MA-8-7 (amendment 16): a retype of an element whose type is NOT one of the office's is never pre-ticked. The category names a kind's type
// catalogue rows are filed under; a structural column is a "Structural Columns" row (or a "Columns" one).
const KIND_CATEGORIES = { wall: ["Walls"], floor: ["Floors"], roof: ["Roofs"], ceiling: ["Ceilings"], door: ["Doors"], window: ["Windows"],
  column: ["Structural Columns"], beam: ["Structural Framing"] };
/** Is the type a retype names ("Family : Type", or a bare type name for a system type) a type of the office's catalogue? `catalog` is the
 *  type_catalog body ({types: [{category, family, type, bic?}]}); `same` is sentinel-core's sameCategory. true = foreign (no catalogue row
 *  of the kind's category), false = a catalogue row, null = no catalogue to judge by. Pure. */
export function foreignOf(kind, typeBefore, catalog, same) {
  if (!catalog || !Array.isArray(catalog.types) || catalog.types.length === 0 || typeof same !== "function" || !text(typeBefore, 256)) return null;
  const norm = (x) => (x ?? "").trim().toLowerCase();
  const cut = typeBefore.indexOf(" : ");
  const family = cut < 0 ? null : norm(typeBefore.slice(0, cut)), type = norm(cut < 0 ? typeBefore : typeBefore.slice(cut + 3));
  const cats = KIND_CATEGORIES[kind] ?? [];
  return !catalog.types.some((t) => norm(t.type) === type && (family === null || norm(t.family) === family) && cats.some((c) => same(t, c)));
}

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

/** MA-7-3: imagery is never put into the model (RVT or IFC; design 4.4). Walks every element value except the human-text fields (reason,
 *  evidence, validate, name) and refuses an image carried as text. ponytail: byte checks, not names — a name is not imagery, and ops carry no file field. */
const IMAGE_B64 = /^(\/9j\/|iVBORw0KGgo|UklGR|AAAAIGZ0eXBoZWlj)/; // JPEG, PNG, WebP, HEIC as base64
export function imageryRefusal(body) {
  const SKIP = ["reason", "evidence", "validate", "name"];
  const hit = (v, path, depth = 0) => {
    if (typeof v === "string") { const t = v.trim(); return /^data:[^,]*;base64,/i.test(t) || /^data:image\//i.test(t) || (t.length > 64 && IMAGE_B64.test(t)) ? path.slice(0, 200) : null; } // review: checkWrite stores the trimmed value
    if (depth > 8 || !v || typeof v !== "object") return null;
    for (const [k, x] of Object.entries(v)) { const h = hit(x, Array.isArray(v) ? `${path}[${k}]` : `${path}.${k}`, depth + 1); if (h) return h; }
    return null;
  };
  for (const [i, el] of body.elements.entries()) {
    if (!el || typeof el !== "object") continue;
    for (const [k, v] of Object.entries(el)) {
      if (SKIP.includes(k)) continue;
      const h = hit(v, `elements[${i}].${k}`);
      if (h) throw err(400, `imagery is never put into the model (RVT or IFC) — ${h} carries an image as text; nothing was filed`);
    }
  }
}
/** MA-7-3: a photo only confirms a ghost or chooses its type (design 4.2), so a source:"photo" changeset creates only a mass or a level. */
export function photoKindRefusal(body, source) {
  if (String(source).toLowerCase() !== "photo") return;
  const el = body.elements.find((e) => e && typeof e === "object" && (e.op ?? "create") === "create" && OP_KINDS.create.includes(e.kind) && !["mass", "level"].includes(e.kind)); // an unknown kind falls through to the kind 400
  if (el) throw err(400, `a photo never creates ${a(el.kind)} on its own — photos confirm a ghost or choose its type (design 4.2); nothing was filed`);
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
export function validateChangeset(body, { member = false, type = null, cite = null, job = null, catalog = null, sameCategory = null } = {}) {
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
  imageryRefusal(body); photoKindRefusal(body, source); // MA-7-3

  const seen = new Set(); // (op, element) pairs: one ghost per change, so a wall can carry one retype and one attach
  const rehosted = new Set(), touched = new Set(); // MA-5b-5: elements a rehost replaces; elements another op edits
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
      throw err(400, `${at}: validate.identity.Class is required (send the kind's IFC class, e.g. IFCWALL; the bridge sets it from the kind)`);
    // Review amendment C3: rebuilt from the names the add-in reads — a posted place.pretick or place.measured is not stored.
    const place = Object.fromEntries(Object.entries(isBlock(el.place) ? el.place : {}).filter(([k]) => PLACE_KEPT.includes(k)));
    // MA-2a: the poster's facts, checked and kept name for name; an attach types nothing, so it takes none.
    const facts = checkFacts(el.facts, at);
    if (facts && (op === "attach" || op === "set_parameter" || op === "delete")) throw err(400, `${at}: ${op} takes no facts — nothing is typed`);
    // MA-2c: a set_parameter's own fields ride on no other op — each would be dropped silently.
    if (op !== "set_parameter")
      for (const f of ["parameter", "revit_parameter", "from", "to", "value_source"])
        if (el[f] !== undefined) throw err(400, `${at}: ${op} takes no ${f} — only a set_parameter writes a value`);
    let written = null; // a set_parameter's checked fields
    let typed = null; // the bridge's typing of this element, when it had to type it
    const typeIt = () => {
      // MA-6-5 (amendment 9a): the element's level, so a rule's when.level (a facade rule) answers an agent's facts as it does the add-in's —
      // text only: this runs before the LevelName and BaseLevel checks below, and the resolver trims it. A create only (review): a retype's
      // element stays on its own level, which the poster does not state and Apply never checks.
      const level = op === "create" ? [place.LevelName, place.BaseLevel].find((s) => text(s, 256)) : undefined;
      typed = type(el.kind, facts, at, level); // a 400 in the typer's words when it cannot
      place.TypeName = typed.TypeName;
      // MA-6-3 review fix: the bridge types the family too, in the rule's spelling — a posted family other than the rule's would store a
      // pair no catalogue row holds, under a `typing` record that says the office rule chose it.
      if (FAMILY_KINDS.includes(el.kind) && text(typed.FamilyName, 256)) {
        if (text(place.FamilyName, 256) && place.FamilyName.trim().toLowerCase() !== typed.FamilyName.trim().toLowerCase())
          throw err(400, `${at}: the bridge types the family too (${typed.FamilyName}, not ${place.FamilyName}) — leave place.FamilyName out, or send place.TypeName`);
        place.FamilyName = typed.FamilyName;
      }
    };
    let target = null;
    let foreign = null; // MA-8-7: a retype's type is not the office's (null: no catalogue to judge by)
    let replaces = null; // MA-8-7 (D16): a wall or floor create that replaces a DirectShape or Generic Model with an office type
    if (el.replaces !== undefined && op !== "create") throw err(400, `${at}: ${op} takes no replaces — only a wall or floor create replaces an element`);
    // MA-8-10: the stair flag a stair is proposed from - the shape here (nested stray keys listed), the flag's own facts in checkFromFlag (the earlier changesets are read in the store).
    let from_flag = null;
    if (el.from_flag !== undefined) {
      if (op !== "create" || el.kind !== "stair") throw err(400, `${at}: from_flag belongs to a stair create only — the stair flag it starts from`);
      const f = el.from_flag;
      if (!isBlock(f)) throw err(400, `${at}: from_flag must be {changeset, unique_id}`);
      nested(f, ["changeset", "unique_id"], `${at}.from_flag`);
      if (typeof f.changeset !== "string" || !UUID.test(f.changeset)) throw err(400, `${at}: from_flag.changeset must be the id (a uuid) of the changeset that holds the flag`);
      if (!text(f.unique_id, 64) || !f.unique_id.startsWith("stair:")) throw err(400, `${at}: from_flag.unique_id must be the stair flag's unique_id (text starting "stair:", at most 64 characters)`);
      from_flag = { changeset: f.changeset.toLowerCase(), unique_id: f.unique_id };
    }
    // MA-8-14: the survey changeset whose scan a terrain's points came off - the shape here, its facts in checkFromScan (the earlier changesets are read in the store).
    // Required: a terrain starts from a scan, and the add-in (not the bridge) read its points - the ledger and the desk say whose word they are.
    let from_scan = null;
    if (el.from_scan !== undefined && (op !== "create" || el.kind !== "terrain")) throw err(400, `${at}: from_scan belongs to a terrain create only — the survey changeset whose scan its points came from`);
    if (op === "create" && el.kind === "terrain") {
      // MA-8-14 review: the bridge cannot tie the points to the scan, so only a signed-in member's Revit (Propose terrain from the scan) files one - never an agent or a script
      if (!member) throw err(400, `${at}: a terrain is filed by a signed-in member from Revit (Propose terrain from the scan) — the machine credential files none; nothing was saved`);
      const f = el.from_scan;
      if (!isBlock(f)) throw err(400, `${at}: a terrain needs from_scan {changeset} — the survey changeset whose scan its ground points came from`);
      nested(f, ["changeset"], `${at}.from_scan`);
      if (typeof f.changeset !== "string" || !UUID.test(f.changeset)) throw err(400, `${at}: from_scan.changeset must be the id (a uuid) of the survey changeset`);
      from_scan = { changeset: f.changeset.toLowerCase() };
    }
    if (op === "create") {
      checkPlace(el.kind, el.place, at);
      if (el.replaces !== undefined) replaces = checkReplaces(el, at, member, nested, rehosted, touched);
      // After checkPlace, so a geometry error still reads as one. The Revit executor refuses an empty type too.
      if (!UNTYPED.includes(el.kind) && !text(place.TypeName, 256)) {
        if (!type) throw err(400, `${at}: a ${el.kind} needs place.TypeName — Sentinel never takes the model's first type`);
        typeIt();
      }
      if (FAMILY_KINDS.includes(el.kind) && !text(place.FamilyName, 256))
        throw err(400, `${at}: a ${el.kind} needs place.FamilyName — a type name alone is not one type`);
      if (["roof", "ceiling", "room", "opening", "stair", "terrain", ...FAMILY_KINDS].includes(el.kind) && !text(place.LevelName, 256))
        throw err(400, `${at}: ${a(el.kind)} needs place.LevelName — Sentinel never picks its level`);
      // MA-6-3 review fix: an opening is its shape — a TypeName on it would be shown to the reviewer and never applied. MA-6-6: so is a mass.
      if ((el.kind === "opening" || el.kind === "mass") && place.TypeName !== undefined) throw err(400, `${at}: ${a(el.kind)} takes no place.TypeName — it is its shape`);
      // MA-6-3 (amendment 3): TopLevel is a wall's top (and a floor's, as before) and now a column's — the level its top reaches. On any
      // other create it is a 400, never kept unread; it stays out of PLACE_FIELDS, so an attach still carries its own.
      if (place.TopLevel !== undefined && !["wall", "floor", "column", "stair"].includes(el.kind)) throw err(400, `${at}: ${a(el.kind)} takes no place.TopLevel`);
      if (el.kind === "column" && place.TopLevel !== undefined) {
        if (!text(place.TopLevel, 256)) throw err(400, `${at}: place.TopLevel must be text of at most 256 characters — the level the column's top reaches`);
        if (place.TopLevel.trim().toLowerCase() === place.LevelName.trim().toLowerCase())
          throw err(400, `${at}: place.TopLevel is the column's own level — name the level its top reaches`);
      }
      // Drill MA2a (F-MA2a-3): a wall or floor names its level too. The executor read only LevelName for a create and put the
      // design's contract-2 wall (BaseLevel and TopLevel, design :675) on the model's lowest level, in silence. Contract 2's
      // BaseLevel names a wall's level and TopLevel its top; two names for one end are refused, never chosen between.
      if (el.kind === "wall" || el.kind === "floor") {
        for (const f of ["BaseLevel", "TopLevel"])
          if (place[f] !== undefined && !text(place[f], 256)) throw err(400, `${at}: place.${f} must be text of at most 256 characters`);
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
    } else if (op === "delete") {
      // Human-error guards §3 (spec 2026-10-21): a delete removes a copy clash triage found modelled twice — named by IFC GlobalId (the web
      // knows those, not UniqueIds): the copy and the element that stays. A signed-in member's only here (the store asks for a lead and the
      // clash register's proof); its stale guard is Revit's own check at Apply (the same type, level, place and size as the one kept).
      if (!member) throw err(400, `${at}: a delete removes an element — only a signed-in lead files one (clash triage on the web); nothing was saved`);
      const copy = el.target?.ifc_guid, keep = el.target?.keeper_ifc_guid;
      if (typeof copy !== "string" || !IFC_GUID.test(copy) || typeof keep !== "string" || !IFC_GUID.test(keep))
        throw err(400, `${at}: delete needs target.ifc_guid (the copy) and target.keeper_ifc_guid (the element that stays) — IFC GlobalIds, 22 characters of their alphabet`);
      if (copy === keep) throw err(400, `${at}: a delete's copy and the element it keeps are one element`);
      if (["unique_id", "type_before", "placed", "at"].some((f) => el.target[f] !== undefined)) throw err(400, `${at}: delete names its copy by target.ifc_guid only — no unique_id, type_before, placed or at`);
      if (Object.keys(isBlock(el.place) ? el.place : {}).length) throw err(400, `${at}: delete takes no place — it removes the copy as it stands`);
      if (seen.has(`delete:${copy}`)) throw err(400, `${at}: a second delete of the copy ${copy}`);
      seen.add(`delete:${copy}`);
      target = { ifc_guid: copy, keeper_ifc_guid: keep };
    } else {
      const uid = el.target?.unique_id;
      if (typeof uid !== "string" || !UNIQUE_ID.test(uid)) throw err(400, `${at}: ${op} needs target.unique_id, a Revit UniqueId`);
      const before = el.target.type_before ?? null;
      if (before !== null && !text(before, 256)) throw err(400, `${at}: target.type_before must be text of at most 256 characters`);
      const p = el.place && typeof el.place === "object" ? el.place : {};
      // A create's place fields ride on no retype or attach: the add-in would ignore them, and reads each into a typed field,
      // so one of the wrong type would fail every review in the project. A door's or window's retype names its family.
      if (op !== "rehost")
        for (const f of Object.keys(PLACE_FIELDS))
          if (p[f] !== undefined && !(f === "FamilyName" && (op === "retype" || op === "set_parameter") && PLACE_FIELDS.FamilyName.includes(el.kind)))
            throw err(400, `${at}: ${op} takes no place.${f} — only a create sets it`);
      if (op !== "rehost" && el.target.at !== undefined) note(`${at}.target.at`, NOT_KEPT); // a rehost's stale guard only
      // MA-5b-5 (design review R12): a rehost's own rules — the first op that removes an element. A signed-in member's only (the machine
      // credential — a signed-out PC, the MCP server, a script — files none); its stale guard (type_before, at) and its whole place are
      // required; the type is Promote's (the DD rule's, D16), never the bridge's.
      if (op === "rehost") {
        if (!member) throw err(400, `${at}: a rehost removes an element — only a signed-in member files one (Promote in Revit, signed in); nothing was saved`);
        if (!text(before, 256)) throw err(400, `${at}: rehost needs target.type_before — the instance's "Family : Type" when it was read (its stale guard)`);
        if (!point(el.target.at)) throw err(400, `${at}: rehost needs target.at [x,y,z] — where the instance stood when it was read (its stale guard)`);
        for (const f of Object.keys(p))
          if (!REHOST_PLACE.includes(f)) throw err(400, `${at}: rehost takes no place.${f} — it takes ${REHOST_PLACE.join(", ")} (its Mark is the old instance's; it is never turned)`);
        if (!text(place.LevelName, 256) || !point(place.Location) || !text(place.FamilyName, 256) || !text(place.TypeName, 256))
          throw err(400, `${at}: rehost needs place.LevelName, place.Location [x,y,z] (on its host wall's location line, at its level) and place.FamilyName and place.TypeName (the office type it becomes)`);
        if (place.SillHeight !== undefined && (el.kind !== "window" || !inRange(place.SillHeight, 0, MAX_OFFSET_MM)))
          throw err(400, `${at}: place.SillHeight is a window's — a number of mm from 0 to ${MAX_OFFSET_MM}`);
        // review: a window rehost carries the placeholder's sill — without it Revit would place the office window at its family's default
        if (el.kind === "window" && place.SillHeight === undefined)
          throw err(400, `${at}: a window rehost needs place.SillHeight — the placeholder's height above its level, so the window stays where it was drawn`);
      }
      // MA-5b-4 (C13b): reshape moves an existing wall's location line to where a revised drawing draws it — only the bridge builds one
      // (from a job, revises), and its stale guard is where the wall was placed: Revit keeps a wall edited since, and says so
      if (op === "reshape") {
        if (!job) throw err(400, `${at}: a reshape is the bridge's — it is proposed from a revised drawing (revises), never posted`);
        if (before !== null) throw err(400, `${at}: reshape takes no target.type_before — its stale guard is target.placed`);
        const c = place.LocationCurve, w = el.target.placed;
        if (!isBlock(c) || !point(c.start) || !point(c.end) || c.start.every((v, i) => v === c.end[i]) || c.mid !== undefined)
          throw err(400, `${at}: reshape needs place.LocationCurve, a straight finite [x,y,z] start and end apart`);
        if (!isBlock(w) || !point(w.start) || !point(w.end)) throw err(400, `${at}: reshape needs target.placed {start, end} — where the wall was placed (its stale guard)`);
        if (place.TypeName !== undefined) throw err(400, `${at}: reshape keeps the wall's type — a retype is its own ghost`);
      }
      if (op === "set_parameter") {
        if (before !== null) throw err(400, `${at}: set_parameter takes no target.type_before — its stale guard is from`);
        written = checkWrite(el, place, at, cite);
      }
      if (op === "retype" && !text(place.TypeName, 256)) {
        if (!type) throw err(400, `${at}: retype needs place.TypeName`);
        typeIt();
      }
      if (op === "retype" && FAMILY_KINDS.includes(el.kind) && !text(place.FamilyName, 256))
        throw err(400, `${at}: a ${el.kind} retype needs place.FamilyName — a type name alone is not one type`);
      if (op === "attach" && (!text(p.BaseLevel, 256) || !text(p.TopLevel, 256) || p.BaseLevel === p.TopLevel))
        throw err(400, `${at}: attach needs two different levels, place.BaseLevel and place.TopLevel`);
      // MA-2c: one set_parameter per type and parameter.
      const k = `${op}:${uid.toLowerCase()}` + (written ? `:${written.parameter.toLowerCase()}` : "");
      if (seen.has(k)) throw err(400, `${at}: a second ${op} for the same element` + (written ? ` and ${written.parameter}` : ""));
      seen.add(k);
      // MA-5b-5: a rehost removes its element — no other ghost may edit it in the same changeset (it would fail on a removed element)
      const u = uid.toLowerCase();
      if (op === "rehost" ? touched.has(u) : rehosted.has(u))
        throw err(400, `${at}: a rehost replaces its element — it carries no other ghost (this changeset has a ${op === "rehost" ? "retype, attach or set_parameter" : "rehost or a replacing create"} of it too)`);
      if (op === "rehost" && rehosted.has(u)) throw err(400, `${at}: a rehost replaces its element — a create of this changeset replaces it too`); // MA-8-7
      (op === "rehost" ? rehosted : touched).add(u);
      // MA-3d: the element's IFC GlobalId, when the add-in sends it — the web desk highlights the ghost's element in the loaded model by it.
      // Optional (a changeset filed by an older add-in has none); a malformed one is a 400 in words; it is kept as sent, never derived.
      const guid = el.target.ifc_guid ?? null;
      if (guid !== null && (typeof guid !== "string" || !IFC_GUID.test(guid))) throw err(400, `${at}: target.ifc_guid must be an IFC GlobalId — 22 characters of its alphabet — when it is sent`);
      if (op === "retype") foreign = foreignOf(el.kind, before, catalog, sameCategory);
      target = { unique_id: uid, type_before: before, ...(guid ? { ifc_guid: guid } : {}),
        ...(op === "reshape" ? { placed: { start: el.target.placed.start, end: el.target.placed.end } } : {}),
        ...(op === "rehost" ? { at: el.target.at } : {}) };
    }
    // MA-6-5 review: the add-in reads these into string properties (ChangesetClient PlaceDto) — one stored as a number would fail the
    // whole project's proposed list in Revit, whatever op or kind did not check it. Last, so an op's or kind's own words win.
    for (const f of ["TypeName", "LevelName", "Name", "BaseLevel", "TopLevel", "FamilyName", "Mark", "Number"])
      if (place[f] != null && typeof place[f] !== "string") throw err(400, `${at}: place.${f} must be text`);
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
    if (written)
      for (const f of ["psets", "quantities"]) if (validate[f] !== undefined) note(`${at}.validate.${f}`, "ignored: set by the bridge from parameter and to");
    // MA-6-1: every op's class is the bridge's, from its kind (C2's rule, for every op): an exact compare, case aside.
    // Review fix: fail closed — a kind added to OP_KINDS without a class here is a 500, never the posted class kept.
    const want = CREATE_ENTITY[el.kind];
    if (!want) throw err(500, `${at}: no IFC class for kind "${el.kind}" — CREATE_ENTITY must name one`);
    if (String(identity.Class).toUpperCase() !== want) { note(`${at}.validate.identity.Class`, "ignored: set by the bridge from kind"); identity.Class = want; }
    const [pset, prop] = written ? written.parameter.split(".") : [];
    return {
      proposal_guid,
      kind: el.kind,
      op, target, reason: el.reason ?? null,
      ...(op === "retype" ? { foreign } : {}), // MA-8-7 (amendment 16): the bridge's judgement; a foreign retype is never pre-ticked
      ...(replaces ? { replaces } : {}),
      ...(from_flag ? { from_flag } : {}),
      ...(from_scan ? { from_scan } : {}),
      validate: written ? { identity, psets: [{ name: pset, rows: [{ name: prop, value: written.to }] }], quantities: [] }
        : { identity, psets: entries(validate.psets, "psets"), quantities: entries(validate.quantities, "quantities") },
      place,
      ...(written ?? {}), // MA-2c: a set_parameter's parameter, from, to and the bridge's value_source
      ...(provenance ? { provenance } : {}), // MA-1a item 4: only when sent, so every other changeset reads as before
      // MA-2a: the poster's facts as a record, and the bridge's own account of who typed the element — its rule, its input,
      // and which guideline and catalogue decided — or "caller" for an element that named its type.
      ...(facts ? { facts } : {}),
      // MA-5a: an element the planner typed by size records that, never "caller" (a survey door or window: holding-logic typeBySize).
      // MA-7-9: a wall typed with a person's material from a photo says so (typing.material_from: the photo, its copy's sha, the person)
      typing: fromJob?.typing ?? (typed ? (fromJob?.material_from ? { ...typed.typing, material_from: fromJob.material_from } : typed.typing) : { typed_by: "caller" }),
      // Review amendment C4: contract 2's reader id and evidence ids, as sent — the caller's claim, like the source.
      ...(el.cid != null ? { cid: el.cid.trim() } : {}),
      ...(el.evidence != null ? { evidence: el.evidence.map((x) => x.trim()) } : {}),
      ...(fromJob ? { measured: fromJob.measured, ...(fromJob.trim_mm ? { trim_mm: fromJob.trim_mm } : {}) } : {}),
      // MA-1a item 8: the bridge's own trust decisions; a body's element is never measured. MA-2a: an element the bridge typed from
      // POSTED facts is never pre-ticked for that (the poster's claim). MA-4d: one it built from a job carries the job's decision — its
      // facts are the measurement the bridge re-hashed (survey-plan's trust record).
      pretick: fromJob ? fromJob.pretick : typed ? false : pretickOf(op, source, target, member, foreign, el.kind),
      accuracy: fromJob ? fromJob.accuracy : { status: "not_measured" },
    };
  });

  // Human-error guards §3: deletes travel alone — a changeset of deletes only — and a copy is never another row's original (deleting both
  // would leave nothing that proves either a copy).
  if (elements.some((e) => e.op === "delete")) {
    if (!elements.every((e) => e.op === "delete")) throw err(400, "a delete is filed in a changeset of deletes only — file the other changes on their own; nothing was saved");
    const keepers = new Set(elements.map((e) => e.target.keeper_ifc_guid));
    const both = elements.find((e) => keepers.has(e.target.ifc_guid));
    if (both) throw err(400, `${both.target.ifc_guid} is deleted as a copy and kept as another's original — one of the two stays; nothing was saved`);
  }

  // MA-8-10: a stair is built in Revit's own stair edit scope - it is the only element of its changeset
  if (elements.some((e) => e.kind === "stair") && elements.length !== 1)
    throw err(400, "a stair changeset holds its stair and nothing else — Revit builds a stair in its own edit scope; file the rest apart");

  // MA-8-14: so is a terrain - a Toposolid is made in one go, from its points around its hole
  if (elements.some((e) => e.kind === "terrain") && elements.length !== 1)
    throw err(400, "a terrain changeset holds its terrain and nothing else — file the rest apart");

  // MA-8-9: a stair flag's source is the bridge's — "ifc" for a flag the bridge built from an IFC job it ran, "posted" for a body's; a flag from any other job is a 400
  const flagSource = !job ? "posted" : String(job.record?.reader ?? "").startsWith("sentinel-ifc ") ? "ifc" : null;
  const exceptions = checkExceptions(body.exceptions, (k, at, why) => note(`${at}.${k}`, why ?? trustWhy(k) ?? NOT_KEPT), flagSource);
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

/** MA-8-7 (D16): a create's `replaces` — {unique_id, box}: the DirectShape or Generic Model instance a wall or floor create re-creates as an
 *  office type; the add-in deletes it in the same Undo step (the second op that removes an element, after rehost). A signed-in member's only;
 *  its UniqueId joins `rehosted`, so no other ghost may name it (and two creates cannot replace one element). The box is where the original
 *  stood when it was read, in whole mm of the model's frame (the add-in's stale guard). Stored as {unique_id, box: {min, max}}. */
function checkReplaces(el, at, member, nested, rehosted, touched) {
  const r = el.replaces;
  if (el.kind !== "wall" && el.kind !== "floor")
    throw err(400, `${at}: only a wall or floor create replaces an element (a DirectShape or Generic Model re-created as an office type), not ${a(el.kind)}`);
  if (!r || typeof r !== "object" || Array.isArray(r)) throw err(400, `${at}: replaces must be {unique_id, box}`);
  nested(r, ["unique_id", "box", "kind", "category"], `${at}.replaces`);
  if (!member) throw err(400, `${at}: a create that replaces removes an element — only a signed-in member files one (Promote in Revit, signed in); nothing was saved`);
  if (typeof r.unique_id !== "string" || !UNIQUE_ID.test(r.unique_id)) throw err(400, `${at}: replaces.unique_id must be a Revit UniqueId`);
  const b = r.box, v3 = (x) => point(x);
  if (!b || typeof b !== "object" || !v3(b.min) || !v3(b.max)) throw err(400, `${at}: replaces.box must be {min: [x, y, z], max: [x, y, z]} — three finite numbers each, in mm (where the original stood)`);
  const min = b.min.map((n) => Math.round(n) || 0), max = b.max.map((n) => Math.round(n) || 0);
  if ([...min, ...max].some((n) => Math.abs(n) > FLAG_REACH_MM)) throw err(400, `${at}: replaces.box values must lie within ${FLAG_REACH_MM / 1000} m of the origin`);
  if (min.some((n, k) => n >= max[k])) throw err(400, `${at}: replaces.box.min must be below box.max on every axis`);
  const u = r.unique_id.toLowerCase();
  if (touched.has(u) || rehosted.has(u))
    throw err(400, `${at}: replaces ${r.unique_id}, which another ghost of this changeset also names — a replaced element carries no other ghost, and two creates cannot replace one`);
  rehosted.add(u);
  // review: what the original is (its class and category), so the reviewer's row and the ledger say what is removed; both optional
  if (r.kind !== undefined && r.kind !== "directshape" && r.kind !== "generic") throw err(400, `${at}: replaces.kind must be "directshape" or "generic"`);
  if (r.category !== undefined && (typeof r.category !== "string" || !r.category.trim() || r.category.length > 80 || /[ -]/.test(r.category)))
    throw err(400, `${at}: replaces.category must be a short text (the original's Revit category)`);
  return { unique_id: r.unique_id, box: { min, max }, ...(r.kind ? { kind: r.kind } : {}), ...(r.category ? { category: r.category.trim() } : {}) };
}

/** MA-8-10: the stair flag each stair of `elements` (as validateChangeset returns them) starts from, checked against `earlier` (every stored
 *  changeset of the project) and `reverted` (its changeset_reverted ledger rows, any order). Pure; a failure is a 4xx in words:
 *  404 - no such changeset, or it holds no such stair flag; 400 - the stair's LevelName is not the flag's storey, or a run end lies outside
 *  the flag's box in plan by more than 1 mm; 409 - another changeset already holds a stair from the same flag: a proposed one ("withdraw it
 *  first"), or an applied one still standing ("undo it in Revit first"). A withdrawn or declined one, and an applied one whose stair was
 *  undone (its newest changeset_reverted row for the stair's guid is an undo), free the flag. */
export function checkFromFlag(elements, earlier, reverted = []) {
  const rows = [...(reverted ?? [])].sort((x, y) => (y.id ?? 0) - (x.id ?? 0)); // newest first
  for (const [i, el] of (elements ?? []).entries()) {
    const f = el.from_flag;
    if (!f) continue;
    const at = `elements[${i}]`;
    const cs = (earlier ?? []).find((c) => c.id === f.changeset);
    if (!cs) throw err(404, `${at}: from_flag names changeset ${f.changeset}, which this project does not hold — nothing was saved`);
    const flag = (cs.exceptions ?? []).find((x) => x.kind === "stair" && x.unique_id === f.unique_id);
    if (!flag) throw err(404, `${at}: changeset "${cs.name}" holds no stair flag ${f.unique_id} — nothing was saved`);
    if (!same(String(flag.storey ?? ""), String(el.place?.LevelName ?? "")))
      throw err(400, `${at}: the flag is on ${flag.storey}, the stair rises from ${el.place?.LevelName} — a stair starts on its flag's storey`);
    const { min, max } = flag.box;
    for (const [end, p] of [["start", el.place.LocationCurve.start], ["end", el.place.LocationCurve.end]])
      if (p[0] < min[0] - 1 || p[0] > max[0] + 1 || p[1] < min[1] - 1 || p[1] > max[1] + 1)
        throw err(400, `${at}: the run leaves the flag's box — its ${end} (${Math.round(p[0])}, ${Math.round(p[1])}) is outside ${Math.round(min[0])}..${Math.round(max[0])} × ${Math.round(min[1])}..${Math.round(max[1])} mm`);
    for (const other of earlier) {
      for (const o of other.elements ?? []) {
        if (o.kind !== "stair" || o.from_flag?.changeset !== f.changeset || o.from_flag?.unique_id !== f.unique_id) continue;
        if (other.status === "proposed") throw err(409, `${at}: this flag is already proposed as "${other.name}" — withdraw it first`);
        if (other.status !== "applied" && other.status !== "partially_applied") continue; // withdrawn, declined: the flag is free
        if (!(other.result?.applied ?? []).some((a) => (a?.proposal_guid ?? a) === o.proposal_guid)) continue; // the stair was not the part applied
        const last = rows.find((y) => y.entity_id === other.id && (y.new_value?.guids ?? []).includes(o.proposal_guid));
        if (last?.new_value?.op !== "undo")
          throw err(409, `${at}: this flag is already built as "${other.name}" (applied) — undo it in Revit first`);
      }
    }
  }
}

/** MA-8-14: the survey changeset each terrain of `elements` starts from, checked against `earlier` (every stored changeset of the project) and `reverted`
 *  (its changeset_reverted ledger rows, any order). Pure; a failure is a 4xx in words: 404 - the project holds no such changeset; 400 - it was not built from
 *  a survey job the bridge ran (a posted body, an IFC or drawing job), so there is no scan behind the points; 409 - another terrain from the same scan is
 *  proposed ("withdraw it first") or applied and still standing ("undo it in Revit first"), as checkFromFlag's stair. The points themselves are the add-in's
 *  word: the bridge read no scan for them (the store ties their level, hole and band to the scan's cut). */
export function checkFromScan(elements, earlier, reverted = []) {
  const rows = [...(reverted ?? [])].sort((x, y) => (y.id ?? 0) - (x.id ?? 0)); // newest first
  for (const [i, el] of (elements ?? []).entries()) {
    const f = el.from_scan;
    if (!f) continue;
    const at = `elements[${i}]`;
    const cs = (earlier ?? []).find((c) => c.id === f.changeset);
    if (!cs) throw err(404, `${at}: from_scan names changeset ${f.changeset}, which this project does not hold — nothing was saved`);
    if (!cs.job || cs.claimed !== false || !String(cs.job.reader ?? "").startsWith("sentinel-survey "))
      throw err(400, `${at}: changeset "${cs.name}" was not built from a survey job the bridge ran — there is no scan behind a terrain from it; nothing was saved`);
    // MA-8-14 review round 2: a terrain from the same scan, not the same changeset - another storey of the job, or another job's survey changeset on the same scan bytes
    const onScan = (o) => o.kind === "terrain" && o.from_scan && sameScan(cs, (earlier ?? []).find((c) => c.id === o.from_scan.changeset) ?? { id: o.from_scan.changeset });
    // MA-8-14 review: one live terrain per scan - a second press (or a retry after a slow reply) would stand two Toposolids on each other
    const twin = (earlier ?? []).find((c) => c.status === "proposed" && (c.elements ?? []).some(onScan));
    if (twin) throw err(409, `${at}: a terrain from "${cs.name}"'s scan is already filed ("${twin.name}") — withdraw it first; nothing was saved`);
    // MA-8-14 review round 1: an applied one still standing holds the scan too (its newest changeset_reverted row for the guid is not an undo), as a stair's flag
    for (const other of earlier ?? []) {
      if (other.status !== "applied" && other.status !== "partially_applied") continue;
      for (const o of other.elements ?? []) {
        if (!onScan(o)) continue;
        if (!(other.result?.applied ?? []).some((a) => (a?.proposal_guid ?? a) === o.proposal_guid)) continue; // the terrain was not the part applied
        const last = rows.find((y) => y.entity_id === other.id && (y.new_value?.guids ?? []).includes(o.proposal_guid));
        // final verification round 1: the 409 names the blocking changeset's id - the add-in frees that one only (TerrainPlanner.Blocker), on the person's word;
        // round 2: the id first, so the add-in's 400-character cut (ChangesetTrust.Refusal) never takes it whatever the level names' length
        if (last?.new_value?.op !== "undo")
          throw err(409, `${at}: changeset ${other.id} (applied) holds this scan — a terrain from "${cs.name}"'s scan is already built as "${other.name}"; undo it in Revit first; nothing was saved`);
      }
    }
  }
}
/** MA-8-14 review round 2: two survey changesets read the same scan - the same changeset, the same job (its ledger row), or a job of the same evidence bytes (a sha256
 *  in both): a survey re-run (a new planner version) files the scan's walls again under a new job, and its terrain would stand on the first. Review round 3: the sha256
 *  alone - admission dedupes by path, so the same file admitted from another path is a new evidence id over the same bytes. */
const sameScan = (a, b) => a.id === b.id || (a.job?.ledger_id != null && a.job.ledger_id === b.job?.ledger_id)
  || (a.job?.evidence ?? []).some((e) => e?.sha256 && (b.job?.evidence ?? []).some((x) => x?.sha256 === e.sha256));

/** MA-8-10: what Revit says it built for a stair - field by field, anything else is null. Revit's read, kept for the ledger; the bridge does not
 *  judge it. A reader that is not a signed-in member's (the machine credential: the bridge cannot tell the add-in from any holder of the
 *  token) is not trusted - amendment 13, as the wall re-read. */
export function keepBuilt(b, member) {
  if (!member) return { why: "reported with the machine credential — sign in in Revit" };
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  if (!int(b.risers, 1, 100) || !inRange(b.riser_mm, 0, 1000) || !inRange(b.going_mm, 0, 2000) || !inRange(b.width_mm, 0, 10000) || !int(b.runs, 0, 10) || !int(b.railings, 0, 20)) return null;
  return { risers: b.risers, riser_mm: b.riser_mm, going_mm: b.going_mm, width_mm: b.width_mm, runs: b.runs, railings: b.railings };
}

/** MA-8-10: the changeset_applied row's account of each applied stair - what was planned (the element's place) beside what Revit read back
 *  (the entry's `built`: null reads "Revit sent no read of what it built - check the model"), and whether they agree (null when nothing was read).
 *  The row never repeats the plan as if it were done. */
export function stairsOf(elements, applied) {
  return (applied ?? []).flatMap((a) => {
    const e = (elements ?? []).find((x) => x.proposal_guid === a.proposal_guid);
    if (e?.kind !== "stair") return [];
    const planned = { risers: e.place.Risers, going_mm: e.place.Going, width_mm: e.place.Width };
    const b = a.built ?? null;
    const read = b && b.risers !== undefined;
    return [{ proposal_guid: a.proposal_guid, planned, built: b,
      as_planned: read ? b.risers === planned.risers && Math.abs(b.going_mm - planned.going_mm) <= 1 && Math.abs(b.width_mm - planned.width_mm) <= 1 : null,
      ...(b === null ? { note: "Revit sent no read of what it built — check the model" } : {}) }];
  });
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

/** MA-8-9: what a stair flag is — the exception row's own fields (unique_id, name, reason) plus these. `source` is the bridge's. */
export const STAIR_FLAG_FIELDS = ["unique_id", "name", "reason", "kind", "storey", "box", "source", "global_id"];
const FLAG_PLAN_MM = [300, 50000], FLAG_HEIGHT_MM = [300, 60000], FLAG_REACH_MM = 3.2e7;

/** MA-8-9: the part of a stair flag a person's pick and a planner's row share — {kind: "stair", storey, box} → the same three, the box in
 *  whole mm, or a 400 in words (`at` names the row). box: {min, max} of [x, y, z] in the model's frame; min below max on every axis; plan
 *  sides 300 to 50 000 mm, height 300 to 60 000 mm. Pure. */
export function checkStairFlag(x, at) {
  if (!x || typeof x !== "object" || Array.isArray(x)) throw err(400, `${at}: must be an object`);
  if (x.kind !== "stair") throw err(400, `${at}: kind "${String(x.kind).slice(0, 40)}" is not an exception kind — only "stair"`);
  if (!text(x.storey, 256)) throw err(400, `${at}: storey is required — the model's level name (at most 256 characters)`);
  const b = x.box;
  const v3 = (a) => Array.isArray(a) && a.length === 3 && a.every((n) => typeof n === "number" && Number.isFinite(n));
  if (!b || typeof b !== "object" || !v3(b.min) || !v3(b.max)) throw err(400, `${at}: box must be {min: [x, y, z], max: [x, y, z]} — three finite numbers each, in mm`);
  const min = b.min.map((n) => Math.round(n) || 0), max = b.max.map((n) => Math.round(n) || 0);   // || 0: never -0
  if ([...min, ...max].some((n) => Math.abs(n) > FLAG_REACH_MM)) throw err(400, `${at}: box values must lie within ${FLAG_REACH_MM / 1000} m of the origin`);
  if (min.some((n, k) => n >= max[k])) throw err(400, `${at}: box.min must be below box.max on every axis`);
  const [w, dp, h] = max.map((n, k) => n - min[k]);
  if (Math.min(w, dp) < FLAG_PLAN_MM[0] || Math.max(w, dp) > FLAG_PLAN_MM[1]) throw err(400, `${at}: the box's plan sides must be ${FLAG_PLAN_MM[0]} to ${FLAG_PLAN_MM[1]} mm (got ${w} × ${dp})`);
  if (h < FLAG_HEIGHT_MM[0] || h > FLAG_HEIGHT_MM[1]) throw err(400, `${at}: the box's height must be ${FLAG_HEIGHT_MM[0]} to ${FLAG_HEIGHT_MM[1]} mm (got ${h})`);
  return { kind: "stair", storey: x.storey.trim(), box: { min, max } };
}

/** MA-8 nits (F-B4-4 review): a stair flag's reason in `max` characters — only the storey name is cut (marked "…"), so the words, box and
 *  coordinates before it and the ref after it stay whole. Pure. */
export const stairReason = (head, storey, tail = "", max = 300) => {
  const room = max - head.length - tail.length;
  return (head + (storey.length > room ? `${storey.slice(0, Math.max(0, room - 1))}…` : storey) + tail).slice(0, max);
};

/** The elements a planner sent to a person instead of proposing a change: optional, at most 1000 rows of
 *  {unique_id (≤64), name?, reason (≤300)}. They ride on the changeset for the reviewer; a bad row is a 400.
 *  MA-8-9: a row with `kind` is a stair flag — checkStairFlag, plus `source` (`flagSource`: "ifc" | "posted", the bridge's; null = a job that is
 *  not an IFC, which flags nothing) and, from an IFC, its `global_id`. Every other row is as before. */
function checkExceptions(rows, extra, flagSource = "posted") {
  if (rows == null) return [];
  if (!Array.isArray(rows)) throw err(400, "exceptions must be an array");
  if (rows.length > MAX_CHANGESET_EXCEPTIONS) throw err(400, `too many exceptions (${rows.length}; limit ${MAX_CHANGESET_EXCEPTIONS})`);
  return rows.map((x, i) => {
    const at = `exceptions[${i}]`;
    if (!x || typeof x !== "object") throw err(400, `${at}: must be an object`);
    if (!text(x.unique_id, 64)) throw err(400, `${at}: unique_id is required (at most 64 characters)`);
    if (!text(x.reason, 300)) throw err(400, `${at}: reason is required (at most 300 characters)`);
    if (x.name != null && !text(x.name, 256)) throw err(400, `${at}: name must be text of at most 256 characters`);
    const flag = x.kind === "stair";   // review: any other `kind` is listed as not kept, as before this slice
    if (flagSource !== "ifc" && x.unique_id.startsWith("stair:")) throw err(400, `${at}: unique_id "stair:…" is the bridge's own - it names a stair flag from an IFC or a person's pick; use another unique_id`);
    if (flag && !flagSource) throw err(400, `${at}: a stair flag comes from an IFC job or a person's pick — this changeset's job is neither`);
    const f = flag ? checkStairFlag(x, at) : null;
    const gid = flag && flagSource === "ifc" && typeof x.global_id === "string" && /^[0-9A-Za-z_$]{22}$/.test(x.global_id) ? x.global_id : null;
    const kept = flag ? [...STAIR_FLAG_FIELDS.slice(0, 6), ...(gid ? ["global_id"] : [])] : STAIR_FLAG_FIELDS.slice(0, 3);
    for (const k of Object.keys(x)) if (!kept.includes(k)) extra(k, at, flag && k === "source" ? SET_BY_BRIDGE : undefined); // listed, not kept
    return { unique_id: x.unique_id, name: x.name ?? null, reason: x.reason, ...(f ? { ...f, source: flagSource, ...(gid ? { global_id: gid } : {}) } : {}) };
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

// ── MA-8-1 (C11): the edit cost of a run — how much of what Sentinel filed a person changed. Computed at read time from rows that exist
//    (the changeset docs and their changeset_reverted rows); nothing is stored but a lead's publish. A run is a job (its ledger row —
//    a job id repeats across jobs folders), else one changeset (Promote has no run id).
export const EDIT_COST_CEILING = "edits made after Apply, other than an Undo in Revit, are not seen";

/** `changesets`: the stored docs; `reverted`: the changeset_reverted rows (any order). Withdrawn changesets are left out of the share and counted (per run in `withdrawn`, ghosts). */
export function editCost(changesets, reverted) {
  const rows = [...(reverted ?? [])].sort((a, b) => (b.id ?? 0) - (a.id ?? 0)); // newest first: a guid's newest row decides
  const last = new Map(); // changeset id → guid → newest reverted row
  for (const y of rows) {
    const m = last.get(y.entity_id) ?? last.set(y.entity_id, new Map()).get(y.entity_id);
    for (const g of y.new_value?.guids ?? []) if (!m.has(g)) m.set(g, y);
  }
  const runs = new Map();
  let withdrawn = 0;
  for (const cs of changesets ?? []) {
    const jobRow = cs.job?.ledger_id != null ? cs.job.ledger_id : null;
    const run = jobRow != null ? `job#${jobRow}` : cs.id;
    const r = runs.get(run) ?? runs.set(run, { run, label: jobRow != null ? `${cs.job.id} (ledger #${jobRow})` : cs.name ?? cs.id,
      filed: 0, web: 0, carried: 0, revit: 0, applied: 0, undone: 0, kept: 0, pending: 0, withdrawn: 0, changesets: [], rests_on: { applied: null, reverted: null } }).get(run);
    if (cs.status === "withdrawn") { withdrawn++; r.withdrawn += cs.elements?.length ?? 0; continue; } // MA-8-1 review: said on the run, not only project-wide
    const ro = r.rests_on;
    r.changesets.push(cs.id);
    r.filed += cs.elements?.length ?? 0;
    if (cs.status === "proposed") { r.pending += cs.elements?.length ?? 0; continue; }
    const res = cs.result ?? {}, web = res.declined_on_web ?? [];
    const carried = web.filter((x) => x.carried_from).length;
    r.web += web.length - carried;
    r.carried += carried;
    r.revit += Math.max(0, (res.rejected?.length ?? 0) - web.length);
    const m = last.get(cs.id);
    // rests_on: the newest report time (the applied row's id is not on the doc) and the newest Undo/Redo row the numbers rest on
    if (res.reported_at && (ro.applied == null || res.reported_at > ro.applied)) ro.applied = res.reported_at;
    for (const y of m?.values() ?? []) if (ro.reverted == null || y.id > ro.reverted) ro.reverted = y.id;
    const applied = (res.applied ?? []).map((a) => a?.proposal_guid ?? a); // stored as {proposal_guid, revit_element_id, …}
    const undone = applied.filter((g) => m?.get(g)?.new_value?.op === "undo").length;
    r.applied += applied.length;
    r.undone += undone;
    r.kept += applied.length - undone;
  }
  const out = [...runs.values()].map((r) => {
    const den = r.filed - r.pending - r.carried;
    return { ...r, share_changed: den > 0 ? (r.web + r.revit + r.undone) / den : null, complete: r.pending === 0, ceiling: EDIT_COST_CEILING };
  });
  return { runs: out, withdrawn, ceiling: EDIT_COST_CEILING };
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

/** MA-7-10: the evidence photos a desk decision cites — `evidence: ["ev-000C"]` on an ACCEPT, at most 3 distinct item ids; [] when none. A photo
 *  confirms a ghost a scan or drawing already proposed; it never creates one and a decline cites nothing. A 400 in words. */
export function citedPhotos(x, i) {
  if (x?.evidence === undefined) return [];
  const bad = (m) => err(400, `decisions[${i}].evidence ${m}; nothing was saved`);
  if (!Array.isArray(x.evidence) || x.evidence.length < 1 || x.evidence.length > 3 || !x.evidence.every((e) => typeof e === "string" && /^ev-[0-9A-Za-z]{1,12}$/.test(e)) || new Set(x.evidence).size !== x.evidence.length)
    throw bad("must be 1 to 3 distinct evidence item ids (ev-…)");
  if (x.decision !== "accept") throw bad("is for an accept only - a photo confirms a ghost, it does not decline one");
  return x.evidence;
}

/** The web desk's decisions on one changeset — [{proposal_guid, decision: accept | decline, reason}] — all or none. `who` is {by, role,
 *  at}. Answers the changeset as it is to be stored (each decided ghost's review, the revision bumped) and one ledger entry per ghost. */
export function applyDecisions(cs, decisions, who, copies = new Map()) {
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
    // MA-7-10: the photos this accept cites, each with the sha of the blurred copy the person saw (the store checked them against the pack)
    const cite = citedPhotos(x, i), shas = Object.fromEntries(cite.map((e) => [e, copies.get(e)]));
    if (cite.some((e) => !copies.get(e))) throw err(400, `decisions[${i}].evidence: ${cite.find((e) => !copies.get(e))} was not checked against the evidence pack; nothing was saved`);
    next.set(g, { state: to, action: x.decision, reason, by: who.by, role: who.role, at: who.at, rev, ...(cite.length ? { evidence: cite, evidence_copies: shas } : {}) });
    rows.push({ proposal_guid: g, name: ghostName(el), from, to, reason, ...(cite.length ? { evidence: cite, evidence_copies: shas } : {}) });
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
// ── Human-error guards §1 (spec 2026-10-21): the review's risk tiers as the bridge can judge them ──

/** The creates that change the model's geometry or its datums — the Revit window's ChangesetTrust.GeometryCreates, name for name. */
export const GEOMETRY_CREATES = ["wall", "floor", "roof", "column", "beam", "stair", "terrain", "level", "grid", "mass", "opening"];
/** The rows risky by what they do, whatever the model holds (ChangesetTrust.RiskyByOp). The bridge cannot see "near a protected element" — Revit
 *  reads that when its window opens — so a row of this list applied with no typed reason is listed as unreasoned, never refused (the model
 *  already holds it). */
export const riskyByOp = (el) => ["reshape", "rehost", "delete"].includes(el?.op) || !!el?.replaces || ((el?.op ?? "create") === "create" && GEOMETRY_CREATES.includes(el?.kind));

/** A result's tick reasons — {proposal_guid: one line} for ticked rows of the "Needs a reason" tier — validated as a decline's reasons are: each
 *  names an applied ghost; null when none. */
export function resultTickReasons(appliedGuids, tick) {
  if (tick == null) return null;
  if (typeof tick !== "object" || Array.isArray(tick)) throw err(400, "tick_reasons must be {proposal_guid: reason} — one line for each ghost applied with a reason");
  const applied = new Set(appliedGuids);
  const out = Object.create(null);
  for (const [g, r] of Object.entries(tick)) {
    if (!applied.has(g)) throw err(400, `tick_reasons names "${g}", which this result does not apply — a tick reason is for an applied ghost`);
    const why = reasonOf(r, false, "a tick");
    if (why != null) out[g] = why;
  }
  return Object.keys(out).length ? { ...out } : null;
}

/** The batch reason (over the 200 a person reviews at once), one line, or null. */
export const batchReasonOf = (b) => reasonOf(b ?? null, false, "a batch");

const STORAGES = ["String", "Integer", "Double", "ElementId"];
/** Human-error guards §3: what Revit read of a copy before it deleted it — the element kept and its writable values — field by field (anything
 *  else is dropped); what Revert re-creates it from. Null when it does not read. */
export const keepDeleted = (b) => {
  if (!b || typeof b !== "object" || typeof b.keeper_unique_id !== "string" || !b.keeper_unique_id || b.keeper_unique_id.length > 256) return null;
  const values = (Array.isArray(b.values) ? b.values : []).slice(0, 300)
    .filter((v) => v && Number.isInteger(v.id) && typeof v.name === "string" && v.name.length <= 256 && STORAGES.includes(v.storage) && typeof v.value === "string" && v.value.length <= 4000)
    .map((v) => ({ id: v.id, name: v.name, storage: v.storage, value: v.value }));
  return { keeper_unique_id: b.keeper_unique_id, values };
};

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
  const uid = el?.target?.unique_id ?? el?.replaces?.unique_id, p = el?.place ?? {}; // MA-8-7: a create that replaces names the element it removes
  if (typeof uid !== "string" || uid === "") return null;
  const one = (s) => (typeof s === "string" && s.trim() !== "" ? s.trim() : null);
  const name = (s) => one(s)?.toLowerCase() ?? null;
  const head = [el.op, el.kind, uid.toLowerCase()];
  if (el.op === "retype") return name(p.TypeName) ? JSON.stringify([...head, name(p.TypeName), name(p.FamilyName)]) : null;
  if (el.op === "attach") return name(p.BaseLevel) && name(p.TopLevel) ? JSON.stringify([...head, name(p.BaseLevel), name(p.TopLevel)]) : null;
  if (el.op === "set_parameter") return one(el.parameter) && typeof el.to === "string" ? JSON.stringify([...head, name(el.parameter), el.to]) : null;
  // MA-8-7: a replacing create is the same change when it re-creates the same element as the same kind of type
  if (el.op === "create") return el.replaces && name(p.TypeName) ? JSON.stringify([...head, name(p.TypeName)]) : null;
  const mm = (q) => (Array.isArray(q) && q.length === 3 && q.every(Number.isFinite) ? q.map(Math.round) : null);
  // MA-5b-4 review: a reshape is the same change when it moves the same wall from the same placed line to the same line (to the mm)
  if (el.op === "reshape") {
    const k = [mm(el.target?.placed?.start), mm(el.target?.placed?.end), mm(p.LocationCurve?.start), mm(p.LocationCurve?.end)];
    return k.every(Boolean) ? JSON.stringify([...head, ...k]) : null;
  }
  // MA-5b-5: a rehost is the same change when it replaces the same element, read where it stood, at the same point, as the same type and sill
  if (el.op === "rehost") {
    const k = [mm(el.target?.at), mm(p.Location)];
    return k.every(Boolean) && name(p.TypeName) ? JSON.stringify([...head, ...k, name(p.TypeName), name(p.FamilyName), Number.isFinite(p.SillHeight) ? Math.round(p.SillHeight) : null]) : null;
  }
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
