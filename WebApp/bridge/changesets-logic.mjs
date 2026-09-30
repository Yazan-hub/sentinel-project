// Governed AI modeling — the pure half of staged changesets. An agent's proposed elements are
// validated (vocabulary + per-kind geometry sanity), adjudication failures are mapped back to the
// element that earned them, and the lifecycle rules live here where they are unit-testable.
//
// THE REFEREE RULE: nothing in this feature creates model data. A changeset is a PROPOSAL — the
// Revit add-in executes only what a human ticks, and only after re-checking the status.
import { randomUUID } from "node:crypto";

export const VOCABULARY = ["wall", "floor", "level", "grid"];
/** What a ghost does. create places a new element (the v1 path); retype and attach change an EXISTING wall, named by
 *  its Revit UniqueId (MA-0 Promote walls). An element without op is a create. */
export const OPS = ["create", "retype", "attach"];
export const MAX_CHANGESET_ELEMENTS = 200;
export const MAX_CHANGESET_EXCEPTIONS = 1000;

const err = (status, message) => Object.assign(new Error(message), { status });
const finite = (n) => typeof n === "number" && Number.isFinite(n);
const point = (p) => Array.isArray(p) && p.length === 3 && p.every(finite);
const text = (s, max) => typeof s === "string" && s.trim() !== "" && s.length <= max;
// Revit's UniqueId: the episode GUID, then "-", then the element id as 8 hex digits.
const UNIQUE_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}-[0-9a-f]{8}$/i;

/** Per-kind geometry sanity. Deliberately shallow: real placement failures surface in Revit's
 *  transaction (and roll the whole changeset back) — this guards against garbage, not bad design. */
function checkPlace(kind, place, at) {
  if (!place || typeof place !== "object") throw err(400, `${at}: place is required`);
  if (kind === "wall" || kind === "grid") {
    const c = place.LocationCurve;
    if (!c || !point(c.start) || !point(c.end)) throw err(400, `${at}: ${kind} needs place.LocationCurve with finite [x,y,z] start and end`);
    // Distinctness is near-free to check here; a zero-length curve would cost a whole-changeset
    // Revit transaction rollback (up to 200 elements) for trivially detectable garbage.
    if (c.start.every((v, i) => v === c.end[i])) throw err(400, `${at}: ${kind} LocationCurve start and end are identical (zero-length)`);
    if (kind === "wall" && place.BaseElevation !== undefined && !finite(place.BaseElevation)) throw err(400, `${at}: BaseElevation must be a finite number`);
    if (kind === "wall" && place.TopElevation !== undefined && !finite(place.TopElevation)) throw err(400, `${at}: TopElevation must be a finite number`);
  } else if (kind === "floor") {
    const loop = place.LocationLoop;
    if (!Array.isArray(loop) || loop.length < 3 || !loop.every(point)) throw err(400, `${at}: floor needs place.LocationLoop of at least 3 finite [x,y,z] points`);
    const distinct = new Set(loop.map((p) => p.join(","))).size;
    if (distinct < 3) throw err(400, `${at}: floor LocationLoop needs at least 3 DISTINCT points (got ${distinct})`);
  } else if (kind === "level") {
    if (!finite(place.BaseElevation)) throw err(400, `${at}: level needs a finite numeric place.BaseElevation`);
  }
}

/** Validate + normalise a proposed changeset. Assigns proposal_guids (a posted one is ignored); a missing
 *  validate.identity.GlobalId is synced to the proposal_guid so adjudication failures (tagged by
 *  GlobalId) map back to the element that earned them. Each element comes back with its op, target and reason, and
 *  the changeset with its exceptions (the walls a planner sent to a person). The element is rebuilt field by field,
 *  so a field added to the shape must be added here too, or it is dropped without an error. */
export function validateChangeset(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw err(400, "a changeset must be an object");
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw err(400, "name is required — a changeset is reviewed by humans and needs a human-readable name");
  if (!Array.isArray(body.elements) || !body.elements.length) throw err(400, "elements must be a non-empty array");
  if (body.elements.length > MAX_CHANGESET_ELEMENTS) throw err(413, `too many elements (${body.elements.length}; limit ${MAX_CHANGESET_ELEMENTS})`);

  const seen = new Set(); // (op, wall) pairs: one ghost per change, so a wall can carry one retype and one attach
  const elements = body.elements.map((el, i) => {
    const at = `elements[${i}]`;
    if (!el || typeof el !== "object") throw err(400, `${at}: must be an object`);
    if (!VOCABULARY.includes(el.kind)) throw err(400, `${at}: kind "${el.kind}" is not supported — allowed: ${VOCABULARY.join(", ")}`);
    const validate = el.validate && typeof el.validate === "object" ? el.validate : {};
    if (!validate.identity || typeof validate.identity.Class !== "string" || !validate.identity.Class)
      throw err(400, `${at}: validate.identity.Class is required (the IFC class adjudication reads)`);
    const op = el.op ?? "create";
    if (!OPS.includes(op)) throw err(400, `${at}: op "${op}" is not supported — allowed: ${OPS.join(", ")}`);
    let target = null;
    if (op === "create") {
      checkPlace(el.kind, el.place, at);
      // After checkPlace, so a geometry error still reads as one. The Revit executor refuses an empty type too.
      if ((el.kind === "wall" || el.kind === "floor") && !text(el.place.TypeName, 256))
        throw err(400, `${at}: a ${el.kind} needs place.TypeName — Sentinel never takes the model's first type`);
    } else {
      if (el.kind !== "wall") throw err(400, `${at}: ${op} is for walls only (v0)`);
      const uid = el.target?.unique_id;
      if (typeof uid !== "string" || !UNIQUE_ID.test(uid)) throw err(400, `${at}: ${op} needs target.unique_id, a Revit UniqueId`);
      const before = el.target.type_before ?? null;
      if (before !== null && !text(before, 256)) throw err(400, `${at}: target.type_before must be text of at most 256 characters`);
      const p = el.place && typeof el.place === "object" ? el.place : {};
      if (op === "retype" && !text(p.TypeName, 256)) throw err(400, `${at}: retype needs place.TypeName`);
      if (op === "attach" && (!text(p.BaseLevel, 256) || !text(p.TopLevel, 256) || p.BaseLevel === p.TopLevel))
        throw err(400, `${at}: attach needs two different levels, place.BaseLevel and place.TopLevel`);
      const k = `${op}:${uid.toLowerCase()}`;
      if (seen.has(k)) throw err(400, `${at}: a second ${op} for the same wall`);
      seen.add(k);
      target = { unique_id: uid, type_before: before };
    }
    if (el.reason != null && !text(el.reason, 500)) throw err(400, `${at}: reason must be text of at most 500 characters`);
    if (validate.psets !== undefined && !Array.isArray(validate.psets)) throw err(400, `${at}: validate.psets must be an array`);
    if (validate.quantities !== undefined && !Array.isArray(validate.quantities)) throw err(400, `${at}: validate.quantities must be an array`);
    const proposal_guid = randomUUID();
    const identity = { ...validate.identity };
    if (!identity.GlobalId) identity.GlobalId = proposal_guid;
    return {
      proposal_guid,
      kind: el.kind,
      op, target, reason: el.reason ?? null,
      validate: { identity, psets: validate.psets || [], quantities: validate.quantities || [] },
      place: { ...el.place },
    };
  });

  return {
    name, source: typeof body.source === "string" && body.source.trim() ? body.source.trim() : "agent",
    elements, exceptions: checkExceptions(body.exceptions),
  };
}

/** The walls a planner sent to a person instead of proposing a change: optional, at most 1000 rows of
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
