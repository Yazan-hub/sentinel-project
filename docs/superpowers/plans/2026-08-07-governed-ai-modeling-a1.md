# Governed AI Modeling A1 (Bridge + MCP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staged, adjudicated, human-gated element changesets: an agent proposes; the bridge validates + adjudicates + stores; the Revit add-in (A2, separate plan) executes only what a human ticks; every step audited.

**Architecture:** A pure logic module (vocabulary, per-kind geometry validation, verdict attachment, lifecycle rules) + a thin store composing the EXISTING `adjudicateProposal` with the EXISTING `bridge_docs` JSONB store (`store:"changeset"`). Five routes; two MCP tools. Changesets are immutable after propose; only status transitions mutate, each audited via `resolveActor`.

**Tech Stack:** Node ESM bridge, vitest, existing sentinel-core adjudication.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-07-governed-ai-modeling-design.md` — the contract section is normative; field names verbatim.
- **The referee rule:** this surface stages proposals; it NEVER creates model data. The only writes are changeset documents + audit rows. `adjudicateProposal` is reused as-is (it writes its own proposal audit row — that is correct and kept; the changeset stores its `audit_id`).
- **Immutable after propose:** no route edits `elements`/`adjudication`. `result` writes exactly once (409 after); `withdraw` only from `proposed` (409 otherwise, message carries the current status).
- **Honesty:** element verdict `recorded` (no IDS) is never presented as accepted; `ids_source` is stored verbatim from the adjudication (`server|client|none|server-invalid`). Result statuses: `applied` (all ticked), `partially_applied` (some), `declined` (none) — derived, never caller-chosen.
- v1 vocabulary frozen: `wall | floor | level | grid`. `MAX_CHANGESET_ELEMENTS = 200`.
- Every write's actor via `resolveActor` (audit() does this internally; store payload `actor` fields use the audited value's source pattern: pass `actor || "agent"` and let `audit()` override with a verified JWT identity — same as every store).
- ESM `.mjs`, no new dependencies, `err(status,msg)` idiom, all commands from `WebApp/`.
- Commits: conventional, ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Test baseline: **425 passing**.

## Existing interfaces consumed (verified verbatim)

```js
// cde-store.mjs
adjudicateProposal(key, {source, actor, ids?, elements, note}) →
  { verdict: "accepted|rejected|recorded", summary, failures: [{element: <GlobalId>, ...}...] (≤200),
    naming, warned, ids_enforce, ids_source: "server|client|none|server-invalid",
    client_ids_ignored, audit_id, recorded_at }
ensureProject(key) → {id, key, ...} (404 unknown)
docList(store, pid) → data[] · docGet(store, pid, docId) → data|null
docInsert(store, pid, docId, data)  // create-only, PostgREST 409 on conflict
docUpsert(store, pid, docId, data)
audit(project_id, entity_type, entity_id, action, actor, oldv, newv)  // resolveActor inside
isUuid(v)
// mcp-server.mjs: TOOLS[], callTool(name, args, deps={fetch}), need(args,key), getJson pattern
```

## File Structure

| File | Responsibility |
|---|---|
| `WebApp/bridge/changesets-logic.mjs` (new) | Pure: vocabulary, validation, verdict attachment, lifecycle rules. |
| `WebApp/bridge/changesets-logic.test.mjs` (new) | Exhaustive. |
| `WebApp/bridge/changesets-store.mjs` (new) | Compose adjudication + bridge_docs + audit. |
| `WebApp/bridge/changesets-store.test.mjs` (new) | Deps-injected lifecycle tests. |
| `WebApp/bridge/bcf-service.mjs` (modify) | `/changesets` route family. |
| `WebApp/bridge/mcp-server.mjs` (modify) | `sentinel_propose_changeset`, `sentinel_changeset_status`. |
| `WebApp/bridge/mcp-server.test.mjs` (extend) | Tool schemas + dispatch. |

---

### Task 1: Pure logic

**Files:**
- Create: `WebApp/bridge/changesets-logic.mjs`
- Test: `WebApp/bridge/changesets-logic.test.mjs`

**Interfaces produced (exact names later tasks import):**
- `VOCABULARY = ["wall", "floor", "level", "grid"]`, `MAX_CHANGESET_ELEMENTS = 200`
- `validateChangeset(body) → {name, source, elements}` (throws 400/413; assigns `proposal_guid` per element; syncs `validate.identity.GlobalId` to `proposal_guid` when absent so adjudication failures map back)
- `attachVerdicts(elements, adj) → elements'` (per-element `verdict: {status, failures}`)
- `canWithdraw(status) → boolean` (true only for `"proposed"`)
- `deriveResultStatus(appliedCount, rejectedCount, total) → "applied"|"partially_applied"|"declined"` (throws if counts don't sum to total)

- [ ] **Step 1: Write the failing tests**

Create `WebApp/bridge/changesets-logic.test.mjs`:

```javascript
import { describe, it, expect } from "vitest";
import {
  VOCABULARY, MAX_CHANGESET_ELEMENTS,
  validateChangeset, attachVerdicts, canWithdraw, deriveResultStatus,
} from "./changesets-logic.mjs";

const wall = (over = {}) => ({
  kind: "wall",
  validate: { identity: { Class: "IFCWALL", Name: "W1" }, psets: [], quantities: [] },
  place: { TypeName: "Generic - 200mm", LevelName: "Level 1", LocationCurve: { start: [0, 0, 0], end: [5000, 0, 0] }, BaseElevation: 0, TopElevation: 3000 },
  ...over,
});
const level = (over = {}) => ({
  kind: "level",
  validate: { identity: { Class: "IFCBUILDINGSTOREY", Name: "L2" }, psets: [], quantities: [] },
  place: { BaseElevation: 3000 },
  ...over,
});
const CS = (elements, over = {}) => ({ name: "Core walls", source: "test-agent", elements, ...over });

describe("VOCABULARY", () => {
  it("is the frozen v1 list", () => expect(VOCABULARY).toEqual(["wall", "floor", "level", "grid"]));
});

describe("validateChangeset — shape", () => {
  it("accepts a valid changeset, assigns unique proposal_guids and syncs missing GlobalIds", () => {
    const v = validateChangeset(CS([wall(), level()]));
    expect(v.name).toBe("Core walls");
    expect(v.elements).toHaveLength(2);
    const guids = v.elements.map((e) => e.proposal_guid);
    expect(new Set(guids).size).toBe(2);
    for (const e of v.elements) {
      expect(e.proposal_guid).toMatch(/^[0-9a-f-]{36}$/i);
      expect(e.validate.identity.GlobalId).toBe(e.proposal_guid); // synced when absent
    }
  });

  it("keeps a caller-supplied GlobalId (does not overwrite)", () => {
    const w = wall();
    w.validate.identity.GlobalId = "agent-gid-1";
    const v = validateChangeset(CS([w]));
    expect(v.elements[0].validate.identity.GlobalId).toBe("agent-gid-1");
  });

  it("requires a name and a non-empty elements array", () => {
    expect(() => validateChangeset(CS([], { name: "" }))).toThrow(/name/i);
    expect(() => validateChangeset(CS([]))).toThrow(/elements/i);
    expect(() => validateChangeset({ name: "x", elements: "nope" })).toThrow(/elements/i);
  });

  it("rejects a kind outside the vocabulary, naming the element index and the allowed set", () => {
    try { validateChangeset(CS([wall(), { ...wall(), kind: "door" }])); throw new Error("no throw"); }
    catch (e) {
      expect(e.status).toBe(400);
      expect(e.message).toMatch(/\[1\]/);
      expect(e.message).toMatch(/wall, floor, level, grid/);
    }
  });

  it("413 over the element cap", () => {
    const many = Array.from({ length: MAX_CHANGESET_ELEMENTS + 1 }, () => wall());
    try { validateChangeset(CS(many)); throw new Error("no throw"); }
    catch (e) { expect(e.status).toBe(413); }
  });

  it("requires validate.identity.Class on every element", () => {
    const bad = wall(); delete bad.validate.identity.Class;
    expect(() => validateChangeset(CS([bad]))).toThrow(/\[0\].*identity\.Class/i);
  });
});

describe("validateChangeset — per-kind place rules", () => {
  it("wall/grid need a two-point LocationCurve with finite numbers", () => {
    const noCurve = wall(); delete noCurve.place.LocationCurve;
    expect(() => validateChangeset(CS([noCurve]))).toThrow(/LocationCurve/);
    const badNum = wall({ place: { ...wall().place, LocationCurve: { start: [0, 0, 0], end: [NaN, 0, 0] } } });
    expect(() => validateChangeset(CS([badNum]))).toThrow(/finite/i);
    const grid = { kind: "grid", validate: { identity: { Class: "IFCGRID", Name: "A" } }, place: { LocationCurve: { start: [0, 0, 0], end: [0, 9000, 0] } } };
    expect(validateChangeset(CS([grid])).elements[0].kind).toBe("grid");
  });

  it("floor needs a closed LocationLoop of ≥3 points", () => {
    const floor = { kind: "floor", validate: { identity: { Class: "IFCSLAB", Name: "F1" } }, place: { LevelName: "Level 1", LocationLoop: [[0, 0, 0], [5000, 0, 0], [5000, 5000, 0]] } };
    expect(validateChangeset(CS([floor])).elements[0].kind).toBe("floor");
    const two = { ...floor, place: { ...floor.place, LocationLoop: [[0, 0, 0], [1, 1, 0]] } };
    expect(() => validateChangeset(CS([two]))).toThrow(/LocationLoop/);
  });

  it("level needs a finite numeric BaseElevation", () => {
    const bad = level({ place: { BaseElevation: "high" } });
    expect(() => validateChangeset(CS([bad]))).toThrow(/BaseElevation/);
  });
});

describe("attachVerdicts", () => {
  const elems = () => validateChangeset(CS([wall(), level()])).elements;

  it("maps adjudication failures to the right element by GlobalId; clean elements are accepted", () => {
    const e = elems();
    const adj = { verdict: "rejected", ids_source: "server", failures: [{ element: e[0].validate.identity.GlobalId, requirement: "FireRating" }] };
    const out = attachVerdicts(e, adj);
    expect(out[0].verdict.status).toBe("rejected");
    expect(out[0].verdict.failures).toHaveLength(1);
    expect(out[1].verdict.status).toBe("accepted");
    expect(out[1].verdict.failures).toEqual([]);
  });

  it("with no spec (recorded), every element is recorded — never accepted", () => {
    const adj = { verdict: "recorded", ids_source: "none", failures: [] };
    for (const el of attachVerdicts(elems(), adj)) expect(el.verdict.status).toBe("recorded");
  });

  it("does not mutate its inputs", () => {
    const e = elems();
    attachVerdicts(e, { verdict: "recorded", ids_source: "none", failures: [] });
    expect(e[0].verdict).toBeUndefined();
  });
});

describe("lifecycle helpers", () => {
  it("canWithdraw only from proposed", () => {
    expect(canWithdraw("proposed")).toBe(true);
    for (const s of ["applied", "partially_applied", "declined", "withdrawn"]) expect(canWithdraw(s)).toBe(false);
  });

  it("deriveResultStatus: all→applied, some→partially_applied, none→declined", () => {
    expect(deriveResultStatus(3, 0, 3)).toBe("applied");
    expect(deriveResultStatus(2, 1, 3)).toBe("partially_applied");
    expect(deriveResultStatus(0, 3, 3)).toBe("declined");
  });

  it("throws when the counts don't account for every element", () => {
    expect(() => deriveResultStatus(1, 1, 3)).toThrow(/account/i);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd WebApp && npx vitest run bridge/changesets-logic.test.mjs` → FAIL (module missing).

- [ ] **Step 3: Implement**

Create `WebApp/bridge/changesets-logic.mjs`:

```javascript
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
```

- [ ] **Step 4: Run to verify pass** — `cd WebApp && npx vitest run bridge/changesets-logic.test.mjs && npx vitest run` → all green (425 + new).

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/changesets-logic.mjs WebApp/bridge/changesets-logic.test.mjs
git commit -m "feat(changesets): pure validation, verdict attachment, lifecycle rules

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Store

**Files:**
- Create: `WebApp/bridge/changesets-store.mjs`
- Test: `WebApp/bridge/changesets-store.test.mjs`

**Interfaces produced (Task 3 routes call these):**
- `proposeChangeset(key, body, actor, deps?) → changeset` (the stored contract object)
- `listChangesets(key, {status}?, deps?) → changeset[]` · `getChangeset(key, id, deps?) → changeset` (404)
- `reportResult(key, id, {applied, rejected, note}, actor, deps?) → changeset` (409 rules)
- `withdrawChangeset(key, id, actor, deps?) → changeset`
- `deps` is the test seam (`{ensureProject, adjudicateProposal, docInsert, docGet, docList, docUpsert, audit}`), same pattern as `bimdocs-ai.mjs`'s `wire()`.

- [ ] **Step 1: Write the failing tests**

Create `WebApp/bridge/changesets-store.test.mjs`:

```javascript
import { describe, it, expect, vi } from "vitest";
import { proposeChangeset, getChangeset, reportResult, withdrawChangeset, listChangesets } from "./changesets-store.mjs";

const wall = () => ({
  kind: "wall",
  validate: { identity: { Class: "IFCWALL", Name: "W1" }, psets: [], quantities: [] },
  place: { TypeName: "Generic - 200mm", LevelName: "Level 1", LocationCurve: { start: [0, 0, 0], end: [5000, 0, 0] } },
});
const BODY = { name: "Core walls", source: "test-agent", elements: [wall(), wall()] };

const baseDeps = (over = {}) => {
  const saved = new Map();
  return {
    saved,
    ensureProject: vi.fn(async () => ({ id: "p1", key: "demo" })),
    adjudicateProposal: vi.fn(async () => ({ verdict: "recorded", summary: {}, failures: [], ids_source: "none", audit_id: 77 })),
    docInsert: vi.fn(async (store, pid, id, data) => { saved.set(id, data); }),
    docGet: vi.fn(async (store, pid, id) => saved.get(id) ?? null),
    docList: vi.fn(async () => [...saved.values()]),
    docUpsert: vi.fn(async (store, pid, id, data) => { saved.set(id, data); }),
    audit: vi.fn(async () => ({})),
    ...over,
  };
};

describe("proposeChangeset", () => {
  it("adjudicates, attaches verdicts, stores the contract shape, audits", async () => {
    const deps = baseDeps();
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    expect(cs.status).toBe("proposed");
    expect(cs.elements).toHaveLength(2);
    expect(cs.elements[0].verdict.status).toBe("recorded");   // no spec → recorded, never accepted
    expect(cs.adjudication).toMatchObject({ verdict: "recorded", ids_source: "none", audit_id: 77 });
    expect(cs.result).toBeNull();
    expect(deps.docInsert).toHaveBeenCalledOnce();
    expect(deps.docInsert.mock.calls[0][0]).toBe("changeset");
    expect(deps.audit.mock.calls[0][3]).toBe("changeset_proposed");
  });

  it("maps per-element failures onto the right elements", async () => {
    const deps = baseDeps();
    deps.adjudicateProposal = vi.fn(async (key, b) => ({
      verdict: "rejected", summary: {}, ids_source: "server", audit_id: 1,
      failures: [{ element: b.elements[1].identity.GlobalId, requirement: "FireRating" }],
    }));
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    expect(cs.elements[0].verdict.status).toBe("accepted");
    expect(cs.elements[1].verdict.status).toBe("rejected");
  });

  it("validation failures reject BEFORE adjudication or storage", async () => {
    const deps = baseDeps();
    await expect(proposeChangeset("demo", { name: "", elements: [wall()] }, "a", deps)).rejects.toMatchObject({ status: 400 });
    expect(deps.adjudicateProposal).not.toHaveBeenCalled();
    expect(deps.docInsert).not.toHaveBeenCalled();
  });

  it("an adjudication engine failure stores NOTHING (a changeset must never exist without verdicts)", async () => {
    const deps = baseDeps();
    deps.adjudicateProposal = vi.fn(async () => { throw Object.assign(new Error("bad IDS"), { status: 400 }); });
    await expect(proposeChangeset("demo", BODY, "a", deps)).rejects.toBeTruthy();
    expect(deps.docInsert).not.toHaveBeenCalled();
  });
});

describe("result + withdraw lifecycle", () => {
  const propose = async (deps) => proposeChangeset("demo", BODY, "agent", deps);

  it("reportResult derives partially_applied, stores the mapping once, audits", async () => {
    const deps = baseDeps();
    const cs = await propose(deps);
    const [a, b] = cs.elements.map((e) => e.proposal_guid);
    const out = await reportResult("demo", cs.id, { applied: [{ proposal_guid: a, revit_element_id: 111, revit_unique_id: "u-1" }], rejected: [b], note: "one unticked" }, "reviewer", deps);
    expect(out.status).toBe("partially_applied");
    expect(out.result.applied[0].revit_element_id).toBe(111);
    expect(deps.audit.mock.calls.some((c) => c[3] === "changeset_applied")).toBe(true);
  });

  it("a second result is a 409 carrying the current status", async () => {
    const deps = baseDeps();
    const cs = await propose(deps);
    const [a, b] = cs.elements.map((e) => e.proposal_guid);
    await reportResult("demo", cs.id, { applied: [], rejected: [a, b] }, "r", deps);
    await expect(reportResult("demo", cs.id, { applied: [], rejected: [a, b] }, "r", deps))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/declined/) });
  });

  it("result guids must exactly cover the changeset — unknown or missing guids are a 400", async () => {
    const deps = baseDeps();
    const cs = await propose(deps);
    const [a] = cs.elements.map((e) => e.proposal_guid);
    await expect(reportResult("demo", cs.id, { applied: [{ proposal_guid: "nope", revit_element_id: 1 }], rejected: [a] }, "r", deps)).rejects.toMatchObject({ status: 400 });
    await expect(reportResult("demo", cs.id, { applied: [], rejected: [a] }, "r", deps)).rejects.toMatchObject({ status: 400 }); // second element unaccounted
  });

  it("withdraw works from proposed, 409 after a result, and blocks a later result", async () => {
    const deps = baseDeps();
    const cs1 = await propose(deps);
    const w = await withdrawChangeset("demo", cs1.id, "agent", deps);
    expect(w.status).toBe("withdrawn");
    const guids = cs1.elements.map((e) => e.proposal_guid);
    await expect(reportResult("demo", cs1.id, { applied: [], rejected: guids }, "r", deps)).rejects.toMatchObject({ status: 409 });
    await expect(withdrawChangeset("demo", cs1.id, "agent", deps)).rejects.toMatchObject({ status: 409 });
  });

  it("getChangeset 404s an unknown id; listChangesets filters by status", async () => {
    const deps = baseDeps();
    const cs = await propose(deps);
    await withdrawChangeset("demo", cs.id, "agent", deps);
    await propose(deps);
    await expect(getChangeset("demo", "missing-id", deps)).rejects.toMatchObject({ status: 404 });
    expect((await listChangesets("demo", { status: "proposed" }, deps))).toHaveLength(1);
    expect((await listChangesets("demo", {}, deps))).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify failure** — module missing.

- [ ] **Step 3: Implement**

Create `WebApp/bridge/changesets-store.mjs`:

```javascript
// Governed AI modeling — staged changesets (the bridge half). Composes the EXISTING adjudication
// path with the EXISTING bridge_docs store. Writes: the changeset document + audit rows. Nothing
// here touches model data — the Revit add-in executes only what a human ticks (A2).
import { randomUUID } from "node:crypto";
import * as cde from "./cde-store.mjs";
import { validateChangeset, attachVerdicts, canWithdraw, deriveResultStatus } from "./changesets-logic.mjs";

const STORE = "changeset";
const err = (status, message) => Object.assign(new Error(message), { status });

const wire = (deps = {}) => ({
  ensureProject: deps.ensureProject || cde.ensureProject,
  adjudicateProposal: deps.adjudicateProposal || cde.adjudicateProposal,
  docInsert: deps.docInsert || cde.docInsert,
  docGet: deps.docGet || cde.docGet,
  docList: deps.docList || cde.docList,
  docUpsert: deps.docUpsert || cde.docUpsert,
  audit: deps.audit || cde.audit,
});

export async function proposeChangeset(key, body, actor, deps) {
  const d = wire(deps);
  const v = validateChangeset(body);                      // 400/413 before any network call
  const proj = await d.ensureProject(key);

  // Reuse the referee as-is: it honours the SENTINEL_IDS server override and writes its own
  // proposal audit row — the changeset stores that audit_id as its adjudication receipt.
  const adj = await d.adjudicateProposal(key, {
    source: v.source, actor,
    elements: v.elements.map((e) => e.validate),
    note: `changeset: ${v.name}`,
  });

  const now = new Date().toISOString();
  const changeset = {
    id: randomUUID(),
    name: v.name, source: v.source, actor: actor || "agent",
    status: "proposed", created_at: now, updated_at: now,
    adjudication: { verdict: adj.verdict, summary: adj.summary, ids_source: adj.ids_source, audit_id: adj.audit_id ?? null },
    elements: attachVerdicts(v.elements, adj),
    result: null,
  };
  await d.docInsert(STORE, proj.id, changeset.id, changeset);
  await d.audit(proj.id, "changeset", changeset.id, "changeset_proposed", actor || "agent", null,
    { name: v.name, source: v.source, elements: changeset.elements.length, verdict: adj.verdict, ids_source: adj.ids_source });
  return changeset;
}

export async function listChangesets(key, { status } = {}, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  const all = await d.docList(STORE, proj.id);
  return status ? all.filter((c) => c.status === status) : all;
}

export async function getChangeset(key, id, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  const cs = await d.docGet(STORE, proj.id, id);
  if (!cs) throw err(404, "changeset not found");
  return cs;
}

/** The add-in's report: which proposals a human ticked (with the created Revit ids) and which they
 *  didn't. Writable exactly once, only from `proposed`. Status is DERIVED from the counts. */
export async function reportResult(key, id, { applied, rejected, note } = {}, actor, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  const cs = await d.docGet(STORE, proj.id, id);
  if (!cs) throw err(404, "changeset not found");
  if (cs.status !== "proposed") throw err(409, `changeset is ${cs.status} — a result can be reported exactly once, from proposed`);

  const appliedArr = Array.isArray(applied) ? applied : [];
  const rejectedArr = Array.isArray(rejected) ? rejected : [];
  for (const [i, a] of appliedArr.entries()) {
    if (!a || typeof a.proposal_guid !== "string" || !Number.isFinite(Number(a.revit_element_id)))
      throw err(400, `applied[${i}] must be {proposal_guid, revit_element_id}`);
  }
  const known = new Set(cs.elements.map((e) => e.proposal_guid));
  const seen = new Set();
  for (const g of [...appliedArr.map((a) => a.proposal_guid), ...rejectedArr]) {
    if (!known.has(g)) throw err(400, `unknown proposal_guid "${g}"`);
    if (seen.has(g)) throw err(400, `proposal_guid "${g}" appears twice in the result`);
    seen.add(g);
  }
  if (seen.size !== cs.elements.length)
    throw err(400, `result must account for every element (${seen.size} of ${cs.elements.length} covered)`);

  const status = deriveResultStatus(appliedArr.length, rejectedArr.length, cs.elements.length);
  const updated = {
    ...cs, status, updated_at: new Date().toISOString(),
    result: {
      applied: appliedArr.map((a) => ({ proposal_guid: a.proposal_guid, revit_element_id: Number(a.revit_element_id), revit_unique_id: a.revit_unique_id ?? null })),
      rejected: rejectedArr, note: typeof note === "string" && note.trim() ? note.trim() : null,
      reported_at: new Date().toISOString(), reported_by: actor || "revit",
    },
  };
  await d.docUpsert(STORE, proj.id, id, updated);
  await d.audit(proj.id, "changeset", id, "changeset_applied", actor || "revit",
    { status: "proposed" },
    { status, applied: updated.result.applied, rejected: rejectedArr.length, note: updated.result.note });
  return updated;
}

export async function withdrawChangeset(key, id, actor, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  const cs = await d.docGet(STORE, proj.id, id);
  if (!cs) throw err(404, "changeset not found");
  if (!canWithdraw(cs.status)) throw err(409, `changeset is ${cs.status} — only a proposed changeset can be withdrawn`);
  const updated = { ...cs, status: "withdrawn", updated_at: new Date().toISOString() };
  await d.docUpsert(STORE, proj.id, id, updated);
  await d.audit(proj.id, "changeset", id, "changeset_withdrawn", actor || "agent", { status: "proposed" }, { status: "withdrawn" });
  return updated;
}
```

- [ ] **Step 4: Run to verify pass** — file + full suite green.

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/changesets-store.mjs WebApp/bridge/changesets-store.test.mjs
git commit -m "feat(changesets): store — adjudicate, stage, result, withdraw (all audited)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Routes

**Files:**
- Modify: `WebApp/bridge/bcf-service.mjs`

**Produces:**
- `POST /changesets/:key` → 201 changeset · `GET /changesets/:key?status=` → list · `GET /changesets/:key/:id` → one
- `POST /changesets/:key/:id/result` → 200 · `POST /changesets/:key/:id/withdraw` → 200

- [ ] **Step 1: Add the block** — immediately BEFORE the existing `if (url.pathname.startsWith("/deliverables"))` line, in that block's exact idiom:

```javascript
  // ── Governed AI modeling: staged element changesets (propose → human ticks in Revit → result) ──
  //   POST /changesets/:key            · GET /changesets/:key?status=proposed
  //   GET  /changesets/:key/:id        · POST /changesets/:key/:id/result { applied, rejected, note }
  //   POST /changesets/:key/:id/withdraw
  if (url.pathname.startsWith("/changesets")) {
    const ch = await import("./changesets-store.mjs");
    try {
      const seg = url.pathname.split("/").filter(Boolean); // ['changesets', key, id?, action?]
      const [, key, p2, p3] = seg;
      const body = req.method === "POST" ? await readBody(req) : {};
      const actor = body.actor || "agent";
      if (!key) return send(res, 404, { message: "changesets route not found" });

      if (!p2 && req.method === "GET") return send(res, 200, await ch.listChangesets(key, { status: url.searchParams.get("status") || undefined }));
      if (!p2 && req.method === "POST") return send(res, 201, await ch.proposeChangeset(key, body, actor));
      if (p2 && !p3 && req.method === "GET") return send(res, 200, await ch.getChangeset(key, p2));
      if (p2 && p3 === "result" && req.method === "POST") return send(res, 200, await ch.reportResult(key, p2, body, actor));
      if (p2 && p3 === "withdraw" && req.method === "POST") return send(res, 200, await ch.withdrawChangeset(key, p2, actor));
      return send(res, 404, { message: "changesets route not found" });
    } catch (e) {
      if (!(e?.status === 401 || e?.status === 403)) console.error(`[changesets] ${req.method} ${url.pathname} → ${e?.status || 500}:`, e?.message || e);
      return send(res, e?.status || 500, { message: String(e?.message || e) });
    }
  }
```

- [ ] **Step 2: Verify** — `node --check bridge/bcf-service.mjs && npx vitest run` → clean, all green.

- [ ] **Step 3: Restart bridge + smoke every route** (kill PID on :4100, `Start-ScheduledTask SentinelBridge`, wait, confirm). With `TOKEN` from `config/.env` (REPO ROOT), on project `demo`: propose a 2-element changeset (one wall, one level — the Task 1 fixture shapes); list with `?status=proposed`; get by id; POST a result covering both guids (one applied with a fake element id, one rejected) → `partially_applied`; POST result again → 409; propose another; withdraw it → `withdrawn`; withdraw again → 409; `GET /deliverables/demo/status` still works (neighbour). Paste real output. Note: the propose ALSO writes an adjudication audit row — expected, it is the receipt.

- [ ] **Step 4: Commit**

```bash
git add WebApp/bridge/bcf-service.mjs
git commit -m "feat(changesets): route family (propose/list/get/result/withdraw)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: MCP tools

**Files:**
- Modify: `WebApp/bridge/mcp-server.mjs`
- Test: `WebApp/bridge/mcp-server.test.mjs` (extend)

**Produces:** `sentinel_propose_changeset`, `sentinel_changeset_status` (11 tools total).

- [ ] **Step 1: Failing tests** — append to `WebApp/bridge/mcp-server.test.mjs`:

```javascript
describe("changeset tools", () => {
  it("registry has 11 tools including the two changeset tools", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toContain("sentinel_propose_changeset");
    expect(names).toContain("sentinel_changeset_status");
    expect(TOOLS).toHaveLength(11);
  });

  it("propose tool description states the referee model and the vocabulary", () => {
    const t = TOOLS.find((t) => t.name === "sentinel_propose_changeset");
    expect(t.description).toMatch(/human review in Revit/i);
    expect(t.description).toMatch(/nothing is created by this call/i);
    expect(t.description).toMatch(/wall, floor, level, grid/);
    expect(t.inputSchema.required).toEqual(["project", "name", "elements"]);
  });

  it("propose POSTs the changeset body", async () => {
    const fetch = vi.fn(async () => okJson({ id: "c1", status: "proposed" }));
    await callTool("sentinel_propose_changeset", { project: "demo", name: "N", source: "agent", elements: [{ kind: "level" }] }, { fetch });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/changesets\/demo$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({ name: "N", source: "agent", elements: [{ kind: "level" }] });
  });

  it("status tool GETs one changeset by id, or lists by status", async () => {
    const fetch = vi.fn(async () => okJson({ id: "c1" }));
    await callTool("sentinel_changeset_status", { project: "demo", changeset: "c1" }, { fetch });
    expect(fetch.mock.calls[0][0]).toMatch(/\/changesets\/demo\/c1$/);
    const fetch2 = vi.fn(async () => okJson([]));
    await callTool("sentinel_changeset_status", { project: "demo", status: "proposed" }, { fetch: fetch2 });
    expect(fetch2.mock.calls[0][0]).toMatch(/\/changesets\/demo\?status=proposed$/);
  });

  it("propose requires project, name and elements before any fetch", async () => {
    const fetch = vi.fn();
    await expect(callTool("sentinel_propose_changeset", { project: "demo" }, { fetch })).rejects.toThrow(/name is required/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — add to `TOOLS` (after `sentinel_doc_integrity`):

```javascript
  {
    name: "sentinel_propose_changeset",
    description:
      "Propose Revit model elements for HUMAN review. Nothing is created by this call: elements are adjudicated against the project's IDS (verdicts attached per element) and STAGED; a person reviews and ticks each element inside Revit before anything enters the model, and the result (created element ids or rejection) is recorded in the audit trail. v1 element kinds: wall, floor, level, grid. Geometry in millimetres, project-internal coordinates: walls/grids need place.LocationCurve {start:[x,y,z], end:[x,y,z]}; floors place.LocationLoop [[x,y,z]×≥3]; levels place.BaseElevation. Each element: {kind, validate:{identity:{Class, Name}, psets:[]}, place:{...}}.",
    inputSchema: {
      type: "object", required: ["project", "name", "elements"],
      properties: {
        project: { type: "string", description: "the project key" },
        name: { type: "string", description: "human-readable changeset name (shown to the reviewer in Revit)" },
        source: { type: "string", description: "agent self-label" },
        elements: { type: "array", description: "the proposed elements (see tool description for the shape)" },
      },
    },
  },
  {
    name: "sentinel_changeset_status",
    description: "Check staged changesets: pass `changeset` (id) for one, or `status` (proposed|applied|partially_applied|declined|withdrawn) to list. Shows per-element verdicts and, once a human reviewed in Revit, the created element ids. Read-only.",
    inputSchema: {
      type: "object", required: ["project"],
      properties: { project: { type: "string" }, changeset: { type: "string" }, status: { type: "string" } },
    },
  },
```

And to `callTool` (before the final unknown-tool throw):

```javascript
  if (name === "sentinel_propose_changeset") {
    const project = need(args, "project"), nm = need(args, "name");
    if (!Array.isArray(args.elements) || !args.elements.length) throw new Error("elements is required (non-empty array)");
    const r = await f(`${BASE}/changesets/${enc(project)}`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify({ name: nm, source: args.source, elements: args.elements }) });
    if (!r.ok) throw new Error(`bridge ${r.status}: ${await r.text()}`);
    return await r.json();
  }
  if (name === "sentinel_changeset_status") {
    const project = need(args, "project");
    if (args.changeset) return await getJson(`/changesets/${enc(project)}/${enc(need(args, "changeset"))}`);
    return await getJson(`/changesets/${enc(project)}${args.status ? `?status=${enc(args.status)}` : ""}`);
  }
```

Note: the tool-count test previously pinned 9 — update THAT assertion to 11 in the same commit (it exists to trip untested tool additions; these are tested).

- [ ] **Step 4: Run to verify pass** — file + full suite green.

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/mcp-server.mjs WebApp/bridge/mcp-server.test.mjs
git commit -m "feat(changesets): MCP propose + status tools (referee model stated)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Live verification

**Files:** none (verify only; report defects, don't fix).

- [ ] **Step 1:** Suite + `node --check` on both modified bridge files.
- [ ] **Step 2:** Bridge restarted (Task 3 did; confirm listening + `GET /health`).
- [ ] **Step 3: Full lifecycle via MCP** (spawn `node bridge/mcp-server.mjs`, JSON-RPC on stdin as in the phase-6 verification): `tools/list` → 11; `sentinel_propose_changeset` on `demo` (2 walls + 1 level, real-ish mm geometry) → proposed changeset with per-element verdicts (`recorded` + `ids_source:"none"` expected unless `SENTINEL_IDS` is set — report which honestly); `sentinel_changeset_status` by id and by `status=proposed`.
- [ ] **Step 4: Result + withdraw via curl:** result covering all guids (2 applied with fake element ids, 1 rejected) → `partially_applied`; second result → 409; new propose → withdraw → 409 on re-withdraw.
- [ ] **Step 5: Audit thread:** `listAudit('demo')` — the newest rows show `Proposal recorded` (adjudication receipt), `changeset_proposed`, `changeset_applied`, `changeset_withdrawn`, actors resolved. Paste them.
- [ ] **Step 6: Read-only proof:** audit count/newest id unchanged across three `GET /changesets/demo` reads.
- [ ] **Step 7: Cleanup:** delete the scratch changesets directly (`node -e` with `sb`): `DELETE bridge_docs?store=eq.changeset&project_id=eq.<pid>&doc_id=in.(...)` for the ids created; confirm `GET /changesets/demo` returns the pre-test list. Audit rows stay (immutable by design — note it). Write `.superpowers/sdd/task-5-report.md` with real output + PASS/FAIL/NOT-RUN per check.

---

## Self-Review

**Spec coverage (A1 scope):** contract fields verbatim incl. `proposal_guid` threading, `adjudication.ids_source`, result mapping → Tasks 1-2. Immutability: no element-editing surface exists; result-once + withdraw-only-from-proposed → Task 2 tests + live 409s. Honesty: recorded ≠ accepted (T1 test), result status derived (T1), adjudication-failure-stores-nothing (T2 test), `SENTINEL_IDS` honoured by reusing `adjudicateProposal` untouched. Routes → T3 (smoked). MCP with referee-model description pinned by test → T4. Audit thread + read-only proof → T5. A2 (add-in) is explicitly out of scope — separate plan after this merges.
**Placeholders:** none; complete code every step.
**Type consistency:** `deps` seam keys ≡ `wire()`; `elements[].proposal_guid/kind/validate/place/verdict` identical across logic → store → tests; route paths ≡ MCP tool URLs; `deriveResultStatus` args (applied, rejected, total) consistent; tool-count test updated 9→11 in the same commit that adds the tools.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-07-governed-ai-modeling-a1.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.

**2. Inline Execution** — executing-plans in this session.

**Which approach?**
