// Governed AI modeling — the pure half of staged changesets. An agent's proposed elements are
// validated (vocabulary + per-kind geometry sanity), adjudication failures are mapped back to the
// element that earned them, and the lifecycle rules live here where they are unit-testable.
//
// THE REFEREE RULE: nothing in this feature creates model data. A changeset is a PROPOSAL — the
// Revit add-in executes only what a human ticks, and only after re-checking the status.
import { randomUUID } from "node:crypto";

export const VOCABULARY = ["wall", "floor", "level", "grid"];
export const MAX_CHANGESET_ELEMENTS = 200;

const err = (status, message) => Object.assign(new Error(message), { status });
const finite = (n) => typeof n === "number" && Number.isFinite(n);
const point = (p) => Array.isArray(p) && p.length === 3 && p.every(finite);

/** Per-kind geometry sanity. Deliberately shallow: real placement failures surface in Revit's
 *  transaction (and roll the whole changeset back) — this guards against garbage, not bad design. */
function checkPlace(kind, place, at) {
  if (!place || typeof place !== "object") throw err(400, `${at}: place is required`);
  if (kind === "wall" || kind === "grid") {
    const c = place.LocationCurve;
    if (!c || !point(c.start) || !point(c.end)) throw err(400, `${at}: ${kind} needs place.LocationCurve with finite [x,y,z] start and end`);
    if (kind === "wall" && place.BaseElevation !== undefined && !finite(place.BaseElevation)) throw err(400, `${at}: BaseElevation must be a finite number`);
    if (kind === "wall" && place.TopElevation !== undefined && !finite(place.TopElevation)) throw err(400, `${at}: TopElevation must be a finite number`);
  } else if (kind === "floor") {
    const loop = place.LocationLoop;
    if (!Array.isArray(loop) || loop.length < 3 || !loop.every(point)) throw err(400, `${at}: floor needs place.LocationLoop of at least 3 finite [x,y,z] points`);
  } else if (kind === "level") {
    if (!finite(place.BaseElevation)) throw err(400, `${at}: level needs a finite numeric place.BaseElevation`);
  }
}

/** Validate + normalise a proposed changeset. Assigns proposal_guids; a missing
 *  validate.identity.GlobalId is synced to the proposal_guid so adjudication failures (tagged by
 *  GlobalId) map back to the element that earned them. */
export function validateChangeset(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw err(400, "a changeset must be an object");
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw err(400, "name is required — a changeset is reviewed by humans and needs a human-readable name");
  if (!Array.isArray(body.elements) || !body.elements.length) throw err(400, "elements must be a non-empty array");
  if (body.elements.length > MAX_CHANGESET_ELEMENTS) throw err(413, `too many elements (${body.elements.length}; limit ${MAX_CHANGESET_ELEMENTS})`);

  const elements = body.elements.map((el, i) => {
    const at = `elements[${i}]`;
    if (!el || typeof el !== "object") throw err(400, `${at}: must be an object`);
    if (!VOCABULARY.includes(el.kind)) throw err(400, `${at}: kind "${el.kind}" is not supported — allowed: ${VOCABULARY.join(", ")}`);
    const validate = el.validate && typeof el.validate === "object" ? el.validate : {};
    if (!validate.identity || typeof validate.identity.Class !== "string" || !validate.identity.Class)
      throw err(400, `${at}: validate.identity.Class is required (the IFC class adjudication reads)`);
    checkPlace(el.kind, el.place, at);
    const proposal_guid = randomUUID();
    const identity = { ...validate.identity };
    if (!identity.GlobalId) identity.GlobalId = proposal_guid;
    return {
      proposal_guid,
      kind: el.kind,
      validate: { identity, psets: validate.psets || [], quantities: validate.quantities || [] },
      place: { ...el.place },
    };
  });

  return { name, source: typeof body.source === "string" && body.source.trim() ? body.source.trim() : "agent", elements };
}

/** Attach per-element verdicts from an adjudication result. Failures are grouped by the GlobalId
 *  sentinel-core tags them with. HONESTY: with no spec (recorded) every element is "recorded" —
 *  never "accepted"; a green tick must mean a spec actually passed. */
export function attachVerdicts(elements, adj) {
  const byId = new Map();
  for (const f of adj?.failures || []) {
    const k = f.element ?? "";
    if (!byId.has(k)) byId.set(k, []);
    byId.get(k).push(f);
  }
  const recorded = adj?.verdict === "recorded";
  return elements.map((el) => {
    const failures = byId.get(el.validate.identity.GlobalId) || [];
    const status = recorded ? "recorded" : failures.length ? "rejected" : "accepted";
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
