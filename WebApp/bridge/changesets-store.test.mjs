import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { proposeChangeset, getChangeset, reportResult, withdrawChangeset, listChangesets, reportReverted, needsTyping, needsCiting,
  reviewChangeset, reopenGhost } from "./changesets-store.mjs";

const wall = () => ({
  kind: "wall",
  validate: { identity: { Class: "IFCWALL", Name: "W1" }, psets: [], quantities: [] },
  place: { TypeName: "Generic - 200mm", LevelName: "Level 1", LocationCurve: { start: [0, 0, 0], end: [5000, 0, 0] } },
});
const BODY = { name: "Core walls", source: "test-agent", elements: [wall(), wall()] };
// MA-2a: a wall posted without place.TypeName, with the facts the bridge types it from.
const untypedWall = (facts = { thickness_mm: 200, params: { Location: "Exterior" } }) => {
  const w = wall(); delete w.place.TypeName; return { ...w, facts };
};
const readRepo = (rel) => JSON.parse(readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8"));
const installed = (kind, body) => ({ body, source: "office", ref: `${kind}@1`, sha256: "ab".repeat(32), pointer_sha_mismatch: false });
const NONE = { body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false };

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
    docReplaceIfField: vi.fn(async (store, pid, id, data) => { saved.set(id, data); return data; }),
    // MA-3a: every write swaps on review_rev (docReplaceIfField); a call of the status-only swap is a test failure, never a network call.
    docReplaceIfStatus: vi.fn(async () => { throw new Error("MA-3a: a changeset write swaps on review_rev — docReplaceIfStatus is not called"); }),
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
      verdict: "rejected", summary: {}, ids_source: "project", audit_id: 1,
      failures: [{ element: b.elements[1].identity.GlobalId, requirement: "FireRating" }],
    }));
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    expect(cs.elements[0].verdict.status).toBe("accepted");
    expect(cs.elements[1].verdict.status).toBe("rejected");
  });

  it("stores unattributed failures on the adjudication (a changeset-level rejection, not any one element's)", async () => {
    const deps = baseDeps();
    deps.adjudicateProposal = vi.fn(async () => ({
      verdict: "rejected", summary: {}, ids_source: "project", audit_id: 2,
      failures: [{ requirement: "model-level rule" }],
    }));
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    expect(cs.adjudication.unattributed).toHaveLength(1);
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

describe("proposeChangeset — bridge typing (MA-2a, full contract 2)", () => {
  const standards = {
    guideline: readRepo("demo/bds-pilot/bds-dd-layerfree-guideline.json"),
    type_catalog: readRepo("demo/bds-pilot/bds-type-catalog.json"),
  };
  const resolving = (have) => vi.fn(async (key, kind) => (have[kind] ? installed(kind, have[kind]) : NONE));

  it("needsTyping: only a body with a typed kind that names no TypeName asks for the standards", () => {
    expect(needsTyping(BODY)).toBe(false);
    expect(needsTyping({ elements: [untypedWall()] })).toBe(true);
    expect(needsTyping({ elements: [{ kind: "level", place: { BaseElevation: 0 } }] })).toBe(false);
    expect(needsTyping({ elements: [{ op: "attach", kind: "wall", place: {} }] })).toBe(false);
    expect(needsTyping({ elements: [{ op: "retype", kind: "wall", place: {} }] })).toBe(true);
    expect(needsTyping({ elements: "nope" })).toBe(false);
  });

  it("a wall without place.TypeName is typed from the project's guideline and catalogue (resolved project → office) and stored typed, with who typed it", async () => {
    const deps = baseDeps({ resolveArtefact: resolving(standards) });
    const cs = await proposeChangeset("ma2a", { name: "typed", source: "agent", contract: 2, elements: [untypedWall(), wall()] }, "agent", deps);
    expect(deps.resolveArtefact.mock.calls.map((c) => c.slice(0, 2))).toEqual([["ma2a", "guideline"], ["ma2a", "type_catalog"]]);
    expect(cs.elements[0].place.TypeName).toBe("BDS_EXT_ARC_CMU_200 mm");
    expect(cs.elements[0].typing).toMatchObject({ typed_by: "bridge", type: "BDS_EXT_ARC_CMU_200 mm", family: "Basic Wall", matched: ["param:Location"],
      guideline: "guideline@1 · office · " + "ab".repeat(6) + "…", guideline_sha256: "ab".repeat(32), catalog: "type_catalog@1 · office · " + "ab".repeat(6) + "…" });
    expect(cs.elements[1].typing).toEqual({ typed_by: "caller" });
    expect(cs.elements[0].pretick).toBe(false);
    expect(deps.saved.get(cs.id).elements[0].place.TypeName).toBe("BDS_EXT_ARC_CMU_200 mm"); // stored as typed
    expect(deps.audit.mock.calls[0][6]).toMatchObject({ typed: 1 });
  });

  it("a body whose every element names its TypeName never reads the standards", async () => {
    const deps = baseDeps({ resolveArtefact: resolving(standards) });
    await proposeChangeset("ma2a", BODY, "agent", deps);
    expect(deps.resolveArtefact).not.toHaveBeenCalled();
  });

  it("with no guideline installed the post is a 400 that says so (not checkable), and nothing is stored", async () => {
    const deps = baseDeps({ resolveArtefact: resolving({ type_catalog: standards.type_catalog }) });
    await expect(proposeChangeset("ma2a", { name: "t", elements: [untypedWall()] }, "agent", deps))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/no guideline is installed for this project or its office \(none — not installed for ma2a or its office\): not checkable/) });
    expect(deps.docInsert).not.toHaveBeenCalled();
  });

  it("a guideline the install validator no longer accepts is none, with its reason", async () => {
    const deps = baseDeps({ resolveArtefact: resolving({ guideline: { standard: "x", elements: [] }, type_catalog: standards.type_catalog }) });
    await expect(proposeChangeset("ma2a", { name: "t", elements: [untypedWall()] }, "agent", deps))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/\(none — guideline@1 · office · abababababab… did not parse: guideline: elements must be a non-empty array\): not checkable/) });
  });

  it("a wall no rule types is a 400 naming the facts it sent; a gap names the catalogue's sizes", async () => {
    const deps = baseDeps({ resolveArtefact: resolving(standards) });
    await expect(proposeChangeset("ma2a", { name: "t", elements: [untypedWall({ thickness_mm: 200, params: { Material: "Stone" } })] }, "agent", deps))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/no rule of guideline@1 · office · abababababab… matches a wall with Material Stone, 200 mm/) });
    await expect(proposeChangeset("ma2a", { name: "t", elements: [untypedWall({ thickness_mm: 125, params: { Location: "Interior" } })] }, "agent", deps))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/"BDS_INT_ARC_CMU_125 mm" .* is not in type_catalog@1 · office · abababababab… — the catalogue has BDS_INT_ARC_CMU_100 mm, BDS_INT_ARC_CMU_150 mm, BDS_INT_ARC_CMU_200 mm, BDS_INT_ARC_CMU_300 mm/) });
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

  it("MA-3b: a result answers the changeset_applied row it wrote, so Revit says \"reported (ledger #n)\" — the stored doc does not keep it", async () => {
    const deps = baseDeps({ audit: vi.fn(async () => ({ id: 1731, hash: "cd".repeat(32) })) });
    const cs = await propose(deps);
    const out = await reportResult("demo", cs.id, { applied: [], rejected: cs.elements.map((e) => e.proposal_guid), note: "drill MA3b: wrong storey" }, "r", deps);
    expect(out).toMatchObject({ status: "declined", ledger: { id: 1731, hash: "cd".repeat(32) }, result: { note: "drill MA3b: wrong storey" } });
    expect(deps.saved.get(cs.id).ledger).toBeUndefined();
    // A ledger that names no row (an older audit answer) is said as such by the add-in (ChangesetTrust.LedgerOf): ledger {id: null}.
    const quiet = baseDeps();
    const cs2 = await propose(quiet);
    const out2 = await reportResult("demo", cs2.id, { applied: [], rejected: cs2.elements.map((e) => e.proposal_guid) }, "r", quiet);
    expect(out2.ledger).toEqual({ id: null, hash: null });
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

describe("CAS guard — concurrent result/withdraw cannot both land", () => {
  const casDeps = () => {
    const deps = baseDeps();
    // Simulate the race: the conditional write says "status was no longer proposed" (0 rows),
    // and the re-read shows a completed changeset written by the concurrent winner.
    deps.docReplaceIfField = vi.fn(async () => null);
    return deps;
  };

  it("reportResult: a lost CAS is a 409 carrying the winner's status, and audits NOTHING", async () => {
    const deps = baseDeps();
    deps.docReplaceIfField = vi.fn(async () => null);
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    const guids = cs.elements.map((e) => e.proposal_guid);
    deps.audit.mockClear();
    deps.saved.set(cs.id, { ...cs, status: "withdrawn" }); // the concurrent winner
    await expect(reportResult("demo", cs.id, { applied: [], rejected: guids }, "r", deps))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/withdrawn/) });
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("withdrawChangeset: same — lost CAS is a 409, no audit row", async () => {
    const deps = baseDeps();
    deps.docReplaceIfField = vi.fn(async () => null);
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    deps.audit.mockClear();
    deps.saved.set(cs.id, { ...cs, status: "applied" });
    await expect(withdrawChangeset("demo", cs.id, "agent", deps))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/applied/) });
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("the happy path still works when the CAS wins", async () => {
    const deps = baseDeps();
    deps.docReplaceIfField = vi.fn(async (store, pid, id, data) => { deps.saved.set(id, data); return data; });
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    const guids = cs.elements.map((e) => e.proposal_guid);
    const out = await reportResult("demo", cs.id, { applied: [], rejected: guids }, "r", deps);
    expect(out.status).toBe("declined");
    expect(deps.docReplaceIfField.mock.calls[0].slice(4, 6)).toEqual(["review_rev", 0]); // MA-3a: the swap is on review_rev (it was on status)
  });
});

describe("CAS — the exact race window: clean first read, then the PATCH loses", () => {
  it("reportResult passes the status guard, loses the CAS, 409s with the winner's status, audits nothing", async () => {
    const deps = baseDeps();
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    const guids = cs.elements.map((e) => e.proposal_guid);
    deps.audit.mockClear();
    // First read sees proposed (the guard passes); the conditional PATCH loses; the re-read sees the winner.
    deps.docGet = vi.fn()
      .mockResolvedValueOnce(cs)
      .mockResolvedValueOnce({ ...cs, status: "withdrawn" });
    deps.docReplaceIfField = vi.fn(async () => null);
    await expect(reportResult("demo", cs.id, { applied: [], rejected: guids }, "r", deps))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/withdrawn/) });
    expect(deps.docReplaceIfField).toHaveBeenCalledOnce(); // the PATCH genuinely ran and lost
    expect(deps.audit).not.toHaveBeenCalled();
  });
});

// H0 (D4, changesets-1): proposing and withdrawing are a contributor's. A result is the Revit add-in's report — since
// H4 on the signed-in person's credential, so a contributor's (the machine credential passes as service). Each refusal
// comes before any adjudication, read or write.
describe("changeset roles (changesets-1)", () => {
  const belowMin = (you) => vi.fn(async (_key, min) => { throw Object.assign(new Error(`this action requires the ${min} role (you are ${you})`), { status: 403 }); });

  it("a viewer proposes nothing: a 403 before the referee runs or anything is written", async () => {
    const deps = baseDeps({ requireMinRole: belowMin("viewer") });
    await expect(proposeChangeset("demo", BODY, "agent", deps)).rejects.toMatchObject({ status: 403, message: "this action requires the contributor role (you are viewer)" });
    expect(deps.adjudicateProposal).not.toHaveBeenCalled();
    expect(deps.docInsert).not.toHaveBeenCalled();
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("a viewer withdraws nothing", async () => {
    const deps = baseDeps();
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    deps.requireMinRole = belowMin("viewer");
    await expect(withdrawChangeset("demo", cs.id, "agent", deps)).rejects.toMatchObject({ status: 403, message: "this action requires the contributor role (you are viewer)" });
    expect(deps.docReplaceIfField).not.toHaveBeenCalled();
  });

  it("a viewer's result is a 403 before the changeset is read; a signed-in contributor's and the machine credential's land", async () => {
    const deps = baseDeps();
    const cs1 = await proposeChangeset("demo", BODY, "agent", deps);
    const cs2 = await proposeChangeset("demo", BODY, "agent", deps);
    const result = (cs) => ({ applied: [], rejected: cs.elements.map((e) => e.proposal_guid) });
    deps.requireMinRole = belowMin("viewer");
    deps.docGet.mockClear();
    await expect(reportResult("demo", cs1.id, result(cs1), "revit", deps))
      .rejects.toMatchObject({ status: 403, message: "this action requires the contributor role (you are viewer)" });
    expect(deps.docGet).not.toHaveBeenCalled();
    expect(deps.docReplaceIfField).not.toHaveBeenCalled();
    deps.requireMinRole = vi.fn(async () => {}); // a signed-in contributor (H4)
    await expect(reportResult("demo", cs1.id, result(cs1), "yazan", deps)).resolves.toMatchObject({ status: "declined" });
    expect(deps.requireMinRole).toHaveBeenCalledWith("demo", "contributor");
    delete deps.requireMinRole; // the real check: no signed-in user → the machine credential, service
    await expect(reportResult("demo", cs2.id, result(cs2), "revit", deps)).resolves.toMatchObject({ status: "declined" });
  });
});

describe("proposeChangeset — MA-0 ops and exceptions reach the doc and the ledger", () => {
  it("stores op, target and reason on each element, the exceptions on the doc and their count on changeset_proposed", async () => {
    const deps = baseDeps();
    const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8";
    const body = {
      name: "Promote walls (DD) · Level 1", source: "promote",
      elements: [
        { op: "retype", kind: "wall", target: { unique_id: UID, type_before: "Generic - 200mm" }, place: { TypeName: "BDS_EXT_ARC_CMU_200 mm" }, reason: "DD walls v0", validate: { identity: { Class: "IfcWall", Name: "W 1" } } },
        { op: "attach", kind: "wall", target: { unique_id: UID }, place: { BaseLevel: "Level 1", TopLevel: "Level 2" }, validate: { identity: { Class: "IfcWall", Name: "W 1" } } },
      ],
      exceptions: [{ unique_id: "5a1c2b3d-1111-2222-3333-444455556666-0004c401", name: "W 2", reason: "gap: no BDS type at 125 mm" }],
    };
    const cs = await proposeChangeset("demo", body, "yazan", deps);
    const stored = deps.saved.get(cs.id);
    expect(stored.elements.map((e) => [e.op, e.target.unique_id, e.reason])).toEqual([["retype", UID, "DD walls v0"], ["attach", UID, null]]);
    expect(stored.elements[0].target.type_before).toBe("Generic - 200mm");
    expect(stored.elements[1].place).toEqual({ BaseLevel: "Level 1", TopLevel: "Level 2" });
    expect(stored.exceptions).toEqual([{ unique_id: body.exceptions[0].unique_id, name: "W 2", reason: "gap: no BDS type at 125 mm" }]);
    const row = deps.audit.mock.calls.find((c) => c[3] === "changeset_proposed");
    expect(row[6]).toMatchObject({ source: "promote", elements: 2, exceptions: 1 });
  });

  it("a changeset without exceptions stores an empty list and counts 0", async () => {
    const deps = baseDeps();
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    expect(deps.saved.get(cs.id).exceptions).toEqual([]);
    expect(deps.audit.mock.calls.find((c) => c[3] === "changeset_proposed")[6].exceptions).toBe(0);
  });
});

// MA-0: Revit reports an Undo/Redo of an applied changeset's transaction as a ledger row; the doc is never rewritten.
describe("reportReverted", () => {
  const belowMin = (you) => vi.fn(async (_key, min) => { throw Object.assign(new Error(`this action requires the ${min} role (you are ${you})`), { status: 403 }); });
  // Two walls proposed, then Revit's result: both applied, or the first applied and the second rejected.
  const appliedChangeset = async (deps, applyBoth = true) => {
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    const [a, b] = cs.elements.map((e) => e.proposal_guid);
    const applied = [{ proposal_guid: a, revit_element_id: 11, revit_unique_id: "u-11" }];
    if (applyBoth) applied.push({ proposal_guid: b, revit_element_id: 12, revit_unique_id: "u-12" });
    const out = await reportResult("demo", cs.id, { applied, rejected: applyBoth ? [] : [b] }, "revit", deps);
    deps.audit.mockClear();
    deps.docReplaceIfField.mockClear();
    return { cs: out, a, b };
  };

  it("the machine credential's undo writes one changeset_reverted row with {op, guids, count} and never rewrites the doc", async () => {
    const deps = baseDeps({ takeWriteBudget: vi.fn() });
    const { cs, a, b } = await appliedChangeset(deps);
    deps.audit.mockResolvedValueOnce({ id: 1093 });
    const row = await reportReverted("demo", cs.id, { op: "undo", guids: [a, b] }, undefined, deps);
    expect(row).toEqual({ id: 1093 });
    expect(deps.audit).toHaveBeenCalledOnce();
    const [pid, type, id, action, actor, oldv, newv] = deps.audit.mock.calls[0];
    expect([pid, type, id, action, actor]).toEqual(["p1", "changeset", cs.id, "changeset_reverted", "revit"]);
    expect(oldv).toEqual({ status: "applied" });
    expect(newv).toEqual({ op: "undo", guids: [a, b], count: 2 });
    expect(deps.takeWriteBudget).toHaveBeenCalledWith("changeset reverts", { perUser: 120, all: 300 });
    expect(deps.docReplaceIfField).not.toHaveBeenCalled();
    expect(deps.saved.get(cs.id).status).toBe("applied");
  });

  it("a signed-in contributor's redo on a partially applied changeset lands too", async () => {
    const deps = baseDeps({ takeWriteBudget: vi.fn() });
    const { cs, a } = await appliedChangeset(deps, false);
    deps.requireMinRole = vi.fn(async () => {});
    await reportReverted("demo", cs.id, { op: "redo", guids: [a] }, "yazan", deps);
    expect(deps.requireMinRole).toHaveBeenCalledWith("demo", "contributor");
    const call = deps.audit.mock.calls[0];
    expect(call[3]).toBe("changeset_reverted");
    expect(call[4]).toBe("yazan");
    expect(call[5]).toEqual({ status: "partially_applied" });
    expect(call[6]).toEqual({ op: "redo", guids: [a], count: 1 });
    expect(deps.docReplaceIfField).not.toHaveBeenCalled();
  });

  it("a viewer is a 403 before the changeset is read", async () => {
    const deps = baseDeps({ takeWriteBudget: vi.fn() });
    const { cs, a } = await appliedChangeset(deps);
    deps.requireMinRole = belowMin("viewer");
    deps.docGet.mockClear();
    await expect(reportReverted("demo", cs.id, { op: "undo", guids: [a] }, "v", deps))
      .rejects.toMatchObject({ status: 403, message: "this action requires the contributor role (you are viewer)" });
    expect(deps.docGet).not.toHaveBeenCalled();
    expect(deps.audit).not.toHaveBeenCalled();
    expect(deps.takeWriteBudget).not.toHaveBeenCalled();
  });

  it("an unknown changeset is a 404", async () => {
    const deps = baseDeps({ takeWriteBudget: vi.fn() });
    await expect(reportReverted("demo", "missing-id", { op: "undo", guids: ["g"] }, "r", deps)).rejects.toMatchObject({ status: 404 });
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("a proposed, declined or withdrawn changeset is a 409", async () => {
    const deps = baseDeps({ takeWriteBudget: vi.fn() });
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    const g = cs.elements[0].proposal_guid;
    for (const status of ["proposed", "declined", "withdrawn"]) {
      deps.saved.set(cs.id, { ...cs, status });
      await expect(reportReverted("demo", cs.id, { op: "undo", guids: [g] }, "r", deps))
        .rejects.toMatchObject({ status: 409, message: `changeset is ${status} — only an applied changeset can be undone` });
    }
    expect(deps.audit.mock.calls.some((c) => c[3] === "changeset_reverted")).toBe(false);
  });

  it("a stray guid, an empty, duplicate, oversized or non-array list, or a bad op is a 400 and writes nothing", async () => {
    const deps = baseDeps({ takeWriteBudget: vi.fn() });
    const { cs, a, b } = await appliedChangeset(deps, false); // b was rejected, so it was never applied
    const bad = [
      [{ op: "undo", guids: [a, b] }, new RegExp(`"${b}" was not applied`)],
      [{ op: "undo", guids: ["not-a-guid"] }, /was not applied/],
      [{ op: "undo", guids: [] }, /guids must be/],
      [{ op: "undo", guids: [a, a] }, /guids must be/],
      [{ op: "undo", guids: Array.from({ length: 201 }, (_, i) => `g${i}`) }, /guids must be/],
      [{ op: "undo", guids: a }, /guids must be/],
      [{ op: "undo", guids: [1] }, /guids must be/],
      [{ op: "delete", guids: [a] }, /op must be/],
      [{ guids: [a] }, /op must be/],
    ];
    for (const [body, re] of bad)
      await expect(reportReverted("demo", cs.id, body, "r", deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(re) });
    await expect(reportReverted("demo", cs.id, undefined, "r", deps)).rejects.toMatchObject({ status: 400 });
    expect(deps.audit).not.toHaveBeenCalled();
    expect(deps.takeWriteBudget).not.toHaveBeenCalled();
  });
});

// MA-1a item 8: the stored changeset — and so the 201 reply — carries the bridge's trust decisions and what it ignored.
describe("proposeChangeset — contract 2's trust rules (MA-1a item 8)", () => {
  it("an agent's pretick and accuracy are ignored: the reply lists them, the ghost is not pre-ticked and is not_measured", async () => {
    const deps = baseDeps();
    const posted = { name: "Agent walls", source: "agent", contract: 2, elements: [{ ...wall(), pretick: true, accuracy: { status: "within_tolerance" } }] };
    const cs = await proposeChangeset("demo", posted, "agent", deps);
    expect(cs.elements[0]).toMatchObject({ pretick: false, accuracy: { status: "not_measured" } });
    expect(cs.claimed).toBe(true);
    expect(cs.contract).toBe(2);
    expect(cs.ignored).toEqual([
      { field: "elements[0].pretick", why: "ignored: set by the bridge" },
      { field: "elements[0].accuracy", why: "ignored: set by the bridge" },
    ]);
    expect(deps.docInsert.mock.calls[0][3]).toMatchObject({ claimed: true, ignored: cs.ignored });
    expect(deps.audit.mock.calls[0][6]).toMatchObject({ claimed: true, ignored: 2 });
  });

  it("a plain changeset is stored claimed, with nothing ignored and no contract field", async () => {
    const cs = await proposeChangeset("demo", BODY, "agent", baseDeps());
    expect(cs).toMatchObject({ claimed: true, ignored: [] });
    expect(cs).not.toHaveProperty("contract");
    expect(cs.elements.map((e) => e.pretick)).toEqual([false, false]);
  });

  it("a Promote attach is pre-ticked for a signed-in member's post — never for the machine credential (review amendment C2)", async () => {
    const body = { name: "Promote", source: "promote", elements: [{ op: "attach", kind: "wall", target: { unique_id: "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8" },
      place: { BaseLevel: "L1", TopLevel: "L2" }, validate: { identity: { Class: "IfcWall", Name: "W 1" } } }] };
    const member = await proposeChangeset("demo", body, "lead@office.example", baseDeps({ myRole: async () => "contributor" }));
    expect(member.elements[0].pretick).toBe(true);
    const machine = await proposeChangeset("demo", body, "agent", baseDeps({ myRole: async () => "service" }));
    expect(machine.elements[0].pretick).toBe(false);
    expect(machine.claimed).toBe(true);
  });
});

// MA-2c: a set_parameter's value_source is checked against the project's installed type catalogue and ids@n (project → office)
// before anything is stored, and each value written rides on the changeset_applied row ([BP] P2-7's param:apply, built once).
describe("proposeChangeset — set_parameter's source, checked by the bridge (MA-2c)", () => {
  const VS = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/value-sources.json", import.meta.url), "utf8"));
  const resolving = (have) => vi.fn(async (key, kind) => (have[kind] ? installed(kind, have[kind]) : NONE));
  const write = (over = {}) => ({
    op: "set_parameter", kind: "wall", target: { unique_id: "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-00000a01" }, place: { TypeName: "BDS_EXT_ARC_CMU_200 mm" },
    parameter: "Pset_WallCommon.FireRating", revit_parameter: "Fire Rating", from: "", to: "60 min", value_source: { kind: "catalogue" },
    validate: { identity: { Class: "IfcWall", Name: "type BDS_EXT_ARC_CMU_200 mm" } }, ...over,
  });

  it("reads the catalogue and the ids@n (never the guideline: nothing is typed) and stores the bridge's record of the source, never pre-ticked", async () => {
    const deps = baseDeps({ resolveArtefact: resolving({ type_catalog: VS.catalog, ids: VS.ids }), myRole: async () => "contributor" });
    const cs = await proposeChangeset("ma2c", { name: "Promote (DD) · Level 1", source: "promote", elements: [write()] }, "lead@office.example", deps);
    expect(deps.resolveArtefact.mock.calls.map((c) => c.slice(0, 2))).toEqual([["ma2c", "type_catalog"], ["ma2c", "ids"]]);
    expect(cs.elements[0]).toMatchObject({ parameter: "Pset_WallCommon.FireRating", from: "", to: "60 min", pretick: false,
      value_source: { kind: "catalogue", ref: "type_catalog@1 · office · abababababab… · BDS_EXT_ARC_CMU_200 mm · Fire Rating", sha256: "ab".repeat(32) } });
    expect(deps.saved.get(cs.id).elements[0].value_source.kind).toBe("catalogue");
  });

  it("a value its source does not hold, or a source that is not installed, is a 400 and nothing is stored", async () => {
    const deps = baseDeps({ resolveArtefact: resolving({ type_catalog: VS.catalog }) });
    await expect(proposeChangeset("ma2c", { name: "t", elements: [write({ to: "90 min" })] }, "agent", deps))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/gives BDS_EXT_ARC_CMU_200 mm Fire Rating "60 min", not "90 min"/) });
    await expect(proposeChangeset("ma2c", { name: "t", elements: [write({ kind: "door", place: { FamilyName: "BDS_INT_1 PNL", TypeName: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" },
      parameter: "Pset_DoorCommon.FireRating", to: "FD30", value_source: { kind: "clause" } })] }, "agent", deps))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/is a clause, and no ids@n is installed for this project or its office \(none — not installed for ma2c or its office\): not checkable/) });
    expect(deps.docInsert).not.toHaveBeenCalled();
    expect(deps.adjudicateProposal).not.toHaveBeenCalled();
  });

  it("the changeset_applied row carries each value written — its kind, type, UniqueIds, parameter, from, to and source; a set_parameter left unticked is not on it", async () => {
    const deps = baseDeps({ resolveArtefact: resolving({ type_catalog: VS.catalog, ids: VS.ids }) });
    const door = write({ kind: "door", target: { unique_id: "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-00000a03" }, place: { FamilyName: "BDS_INT_1 PNL", TypeName: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" },
      parameter: "Pset_DoorCommon.FireRating", to: "FD30", value_source: { kind: "clause" } });
    const cs = await proposeChangeset("ma2c", { name: "t", source: "promote", elements: [write(), door] }, "agent", deps);
    const [w, d] = cs.elements;
    const TYPE_UID = "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-00000a01";
    await reportResult("ma2c", cs.id, { applied: [{ proposal_guid: w.proposal_guid, revit_element_id: 401, revit_unique_id: TYPE_UID }], rejected: [d.proposal_guid] }, "revit", deps);
    const row = deps.audit.mock.calls.find((c) => c[3] === "changeset_applied");
    // C9: the type named exactly — its kind, the UniqueId the plan named and the one Revit reported (one name can be a wall's and a ceiling's).
    expect(row[6].values).toEqual([{ proposal_guid: w.proposal_guid, kind: "wall", type: "BDS_EXT_ARC_CMU_200 mm", unique_id: TYPE_UID, revit_unique_id: TYPE_UID,
      parameter: "Pset_WallCommon.FireRating", from: "", to: "60 min", value_source: w.value_source }]);
    const plain = await proposeChangeset("demo", BODY, "agent", deps);
    await reportResult("demo", plain.id, { applied: plain.elements.map((e, i) => ({ proposal_guid: e.proposal_guid, revit_element_id: 10 + i })), rejected: [] }, "revit", deps);
    expect(deps.audit.mock.calls.filter((c) => c[3] === "changeset_applied").at(-1)[6]).not.toHaveProperty("values");
  });

  it("needsCiting: only a body with a set_parameter reads the catalogue and the ids@n; needsTyping never types one", () => {
    expect(needsCiting(BODY)).toBe(false);
    expect(needsCiting({ elements: [write()] })).toBe(true);
    expect(needsTyping({ elements: [write({ place: {} })] })).toBe(false);
  });
});

// MA-3a: the web desk's review loop. Every write of a changeset doc swaps on review_rev (gotcha 1: a status-only swap lost a web
// decision written between a read and a write); a review or re-open is a signed-in person's (Q1); Revit's result is judged against
// the web's declines (Q2).
describe("MA-3a — every write swaps on review_rev", () => {
  const twoWalls = async (deps) => proposeChangeset("demo", BODY, "agent", deps);

  it("a changeset is filed at revision 0; a result and a withdraw each swap on the revision they read and bump it", async () => {
    const deps = baseDeps();
    const cs = await twoWalls(deps);
    expect(deps.saved.get(cs.id).review_rev).toBe(0);
    const out = await reportResult("demo", cs.id, { applied: [], rejected: cs.elements.map((e) => e.proposal_guid) }, "r", deps);
    expect(deps.docReplaceIfField.mock.calls[0].slice(0, 3)).toEqual(["changeset", "p1", cs.id]);
    expect(deps.docReplaceIfField.mock.calls[0].slice(4, 6)).toEqual(["review_rev", 0]);
    expect(out.review_rev).toBe(1);
    const cs2 = await twoWalls(deps);
    expect((await withdrawChangeset("demo", cs2.id, "agent", deps)).review_rev).toBe(1);
    expect(deps.docReplaceIfField.mock.calls[1].slice(4, 6)).toEqual(["review_rev", 0]);
  });

  it("every changeset doc write is the bridge's, with the service key, after its own role check (C1, migration 0037)", async () => {
    const deps = baseDeps();
    const cs = await twoWalls(deps);
    expect(deps.docInsert.mock.calls[0][4]).toEqual({ service: true });
    await withdrawChangeset("demo", cs.id, "agent", deps);
    expect(deps.docReplaceIfField.mock.calls[0][6]).toEqual({ service: true });
  });

  it("a doc from before MA-3a (no review_rev) swaps on the field being absent", async () => {
    const deps = baseDeps();
    const cs = await twoWalls(deps);
    const { review_rev, ...legacy } = deps.saved.get(cs.id);
    deps.saved.set(cs.id, legacy);
    await withdrawChangeset("demo", cs.id, "agent", deps);
    expect(deps.docReplaceIfField.mock.calls[0].slice(4, 6)).toEqual(["review_rev", null]);
    expect(deps.saved.get(cs.id).review_rev).toBe(1);
  });

  it("a web decline written between the result's read and its write is kept: the swap loses, the result is decided again on the new doc", async () => {
    const deps = baseDeps();
    const cs = await twoWalls(deps);
    const [a, b] = cs.elements.map((e) => e.proposal_guid);
    const declined = { ...cs, review_rev: 1, elements: cs.elements.map((e) => e.proposal_guid === b
      ? { ...e, review: { state: "declined", action: "decline", reason: "not here", by: "web@example.com", role: "contributor", at: "t", rev: 1 } } : e) };
    const real = deps.docReplaceIfField;
    deps.docReplaceIfField = vi.fn()
      .mockImplementationOnce(async () => { deps.saved.set(cs.id, declined); return null; }) // the web's write lands first
      .mockImplementation(real);
    const out = await reportResult("demo", cs.id, { applied: [{ proposal_guid: a, revit_element_id: 5 }], rejected: [b], review_rev: 0 }, "revit", deps);
    expect(deps.docReplaceIfField.mock.calls.map((c) => c[5])).toEqual([0, 1]);
    expect(out.review_rev).toBe(2);
    expect(out.elements[1].review.state).toBe("declined"); // not overwritten
    expect(out.result.declined_on_web).toEqual([{ proposal_guid: b, name: 'create wall "W1"', by: "web@example.com", role: "contributor", reason: "not here", rev: 1 }]);
  });

  it("three lost swaps in a row are a 503 in words — Revit's Report offers Retry (C3) — and nothing is recorded", async () => {
    const deps = baseDeps();
    const cs = await twoWalls(deps);
    deps.docReplaceIfField = vi.fn(async () => null);
    deps.audit.mockClear();
    await expect(withdrawChangeset("demo", cs.id, "agent", deps))
      .rejects.toMatchObject({ status: 503, message: "the changeset changed three times while this was being written — nothing was saved; send it again" });
    expect(deps.docReplaceIfField).toHaveBeenCalledTimes(3);
    expect(deps.audit).not.toHaveBeenCalled();
  });
});

const ma3a = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/ma3a-review.json", import.meta.url), "utf8"));
/** A changeset doc already stored (a copy), and the deps that read it. */
const seededWith = (doc, over = {}) => { const deps = baseDeps(over); deps.saved.set(doc.id, JSON.parse(JSON.stringify(doc))); return deps; };
/** myRole answering these roles, one per call. */
const as = (...roles) => { const f = vi.fn(); for (const r of roles) f.mockResolvedValueOnce(r); return f; };

describe("MA-3a — reviewChangeset and reopenGhost: a signed-in person, contributor to decide, lead to re-open", () => {
  const fx = ma3a;
  const seeded = (doc = fx.before, over = {}) => seededWith(doc, over);

  it("the machine credential never reviews or re-opens: a 403 that says sign in, before anything is read", async () => {
    const deps = seeded(); // no myRole mock: the real check, no signed-in user → service
    deps.docGet.mockClear();
    await expect(reviewChangeset("demo", "cs-ma3a", { decisions: fx.decisions }, "agent", deps))
      .rejects.toMatchObject({ status: 403, message: "accepting or declining a ghost on the web desk is a signed-in person's — sign in (the machine credential, the MCP agent and scripts never review)" });
    await expect(reopenGhost("demo", "cs-ma3a", { proposal_guid: "g-1", reason: "why" }, "agent", deps))
      .rejects.toMatchObject({ status: 403, message: "re-opening a declined ghost on the web desk is a signed-in person's — sign in (the machine credential, the MCP agent and scripts never review)" });
    expect(deps.docGet).not.toHaveBeenCalled();
    expect(deps.docReplaceIfField).not.toHaveBeenCalled();
  });

  it("a viewer or a non-member decides nothing; a contributor re-opens nothing", async () => {
    const deps = seeded(fx.after, { myRole: as("viewer", null, "contributor") });
    await expect(reviewChangeset("demo", "cs-ma3a", { decisions: fx.decisions }, "v", deps))
      .rejects.toMatchObject({ status: 403, message: "accepting or declining a ghost requires the contributor role (you are viewer)" });
    await expect(reviewChangeset("demo", "cs-ma3a", { decisions: fx.decisions }, "n", deps))
      .rejects.toMatchObject({ status: 403, message: "accepting or declining a ghost requires the contributor role (you are not a member)" });
    await expect(reopenGhost("demo", "cs-ma3a", { proposal_guid: "g-1", reason: "why" }, "c", deps))
      .rejects.toMatchObject({ status: 403, message: "re-opening a declined ghost requires the lead role (you are contributor)" });
    expect(deps.docReplaceIfField).not.toHaveBeenCalled();
  });

  it("a contributor's decisions are stored on the doc (the fixture's `after`) and written as ONE changeset_reviewed row", async () => {
    const deps = seeded(fx.before, { myRole: as("contributor"), audit: vi.fn(async () => ({ id: 1201, hash: "ab".repeat(32) })) });
    const out = await reviewChangeset("demo", "cs-ma3a", { decisions: fx.decisions }, fx.who.by, deps);
    const stored = deps.saved.get("cs-ma3a");
    expect({ ...stored, updated_at: fx.after.updated_at, elements: stored.elements.map((e) => e.review ? { ...e, review: { ...e.review, at: fx.who.at } } : e) }).toEqual(fx.after);
    expect(out.changeset).toEqual(stored);
    expect(out.ledger).toEqual({ id: 1201, hash: "ab".repeat(32) });
    expect(deps.audit).toHaveBeenCalledOnce();
    const [pid, type, id, action, actor, before, after] = deps.audit.mock.calls[0];
    expect([pid, type, id, action, actor, before]).toEqual(["p1", "changeset", "cs-ma3a", "changeset_reviewed", fx.who.by, { review_rev: 0 }]);
    expect(after).toMatchObject({ review_rev: 1, reviewer: fx.who.by, role: "contributor" });
    expect(after.decisions.map((d) => [d.proposal_guid, d.to, d.reason])).toEqual([["g-1", "declined", "wrong type: W 1 is a party wall"], ["g-2", "accepted", null], ["g-4", "declined", "no fire strategy issued yet"]]);
  });

  it("a refused step writes nothing and no row (all or none)", async () => {
    const deps = seeded(fx.after, { myRole: as("lead") });
    await expect(reviewChangeset("demo", "cs-ma3a", { decisions: [{ proposal_guid: "g-3", decision: "accept" }, { proposal_guid: "g-1", decision: "accept" }] }, "l", deps))
      .rejects.toMatchObject({ status: 409, message: 'retype wall "W 1": this ghost is declined — only a lead may re-open it, then it can be accepted' });
    expect(deps.docReplaceIfField).not.toHaveBeenCalled();
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("a lead re-opens a decline: proposed again on the doc, ONE changeset_reopened row naming who declined it", async () => {
    const deps = seeded(fx.after, { myRole: as("lead") });
    const out = await reopenGhost("demo", "cs-ma3a", { proposal_guid: "g-1", reason: fx.reopen.reason }, fx.reopen.who.by, deps);
    expect({ ...out.changeset.elements[0].review, at: fx.reopen.who.at }).toEqual(fx.reopened_review);
    expect(out.changeset.review_rev).toBe(2);
    const row = deps.audit.mock.calls[0];
    expect(row.slice(3, 6)).toEqual(["changeset_reopened", fx.reopen.who.by, { review_rev: 1, state: "declined" }]);
    expect(row[6]).toEqual({ review_rev: 2, lead: fx.reopen.who.by, role: "lead", proposal_guid: "g-1", name: 'retype wall "W 1"',
      declined_by: fx.who.by, declined_reason: "wrong type: W 1 is a party wall", reason: fx.reopen.reason });
  });

  it("C7: a decision or a re-open the ledger does not take is taken back off the doc — a 503, and the same send lands later", async () => {
    const ledgerDown = () => vi.fn().mockRejectedValueOnce(Object.assign(new Error("timeout"), { status: 502 })).mockResolvedValue({ id: 9, hash: "cd".repeat(32) });
    const deps = seeded(fx.before, { myRole: as("contributor", "contributor"), audit: ledgerDown() });
    await expect(reviewChangeset("demo", "cs-ma3a", { decisions: fx.decisions }, fx.who.by, deps))
      .rejects.toMatchObject({ status: 503, message: "the ledger did not take the decision — nothing was saved; send it again" });
    const back = deps.saved.get("cs-ma3a");
    expect(back.elements).toEqual(fx.before.elements); // no review on any ghost: Revit obeys nothing the ledger lacks
    expect(back.review_rev).toBe(2);                   // the rev moves on: a Revit that re-checked rev 1 saw a decline that is gone
    const out = await reviewChangeset("demo", "cs-ma3a", { decisions: fx.decisions }, fx.who.by, deps); // the retry is not a 409
    expect(out.changeset.elements[0].review.state).toBe("declined");
    expect(deps.audit).toHaveBeenCalledTimes(2);

    const lead = seeded(fx.after, { myRole: as("lead"), audit: ledgerDown() });
    await expect(reopenGhost("demo", "cs-ma3a", { proposal_guid: "g-1", reason: fx.reopen.reason }, fx.reopen.who.by, lead))
      .rejects.toMatchObject({ status: 503, message: "the ledger did not take the re-open — nothing was saved; send it again" });
    expect(lead.saved.get("cs-ma3a").elements).toEqual(fx.after.elements); // still declined
  });

  it("C7: when the take-back itself loses its swap, the 502 says the decision stands without its row", async () => {
    const deps = seeded(fx.before, { myRole: as("contributor"), audit: vi.fn(async () => { throw new Error("timeout"); }) });
    deps.docReplaceIfField.mockImplementationOnce(async (s, p, id, data) => { deps.saved.set(id, data); return data; }).mockResolvedValueOnce(null);
    await expect(reviewChangeset("demo", "cs-ma3a", { decisions: fx.decisions }, fx.who.by, deps))
      .rejects.toMatchObject({ status: 502, message: expect.stringContaining("the decision is saved on the changeset but the ledger has no row for it") });
  });
});

describe("MA-3a — Revit's result against the web's declines (Q2)", () => {
  const fx = ma3a;
  const seeded = seededWith;
  const applied = (g, id = 7) => ({ proposal_guid: g, revit_element_id: id });

  it("applying a ghost Revit had seen declined is a 409 naming it; nothing is written and no row", async () => {
    const deps = seeded(fx.after);
    await expect(reportResult("demo", "cs-ma3a", { applied: [applied("g-1")], rejected: ["g-2", "g-3", "g-4"], review_rev: 1 }, "revit", deps))
      .rejects.toMatchObject({ status: 409, message: 'retype wall "W 1" was declined on the web by reviewer@example.com (contributor): "wrong type: W 1 is a party wall" — review_rev 1, which this result says Revit re-checked; Revit refuses that tick, so this result is refused. Nothing was recorded; the changeset stays proposed' });
    expect(deps.docReplaceIfField).not.toHaveBeenCalled();
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("the shared fixture: a ghost declined after Revit's re-check is applied over the decline, recorded on the result and the row", async () => {
    const deps = seeded(fx.after, { myRole: as("lead", "contributor") });
    await reopenGhost("demo", "cs-ma3a", { proposal_guid: "g-1", reason: fx.reopen.reason }, "lead@example.com", deps); // revision 2 — Revit re-checks here
    await reviewChangeset("demo", "cs-ma3a", { decisions: [{ proposal_guid: "g-3", decision: "decline", reason: "W 2 is demolished" }] }, "reviewer@example.com", deps); // 3
    deps.audit.mockClear();
    const out = await reportResult("demo", "cs-ma3a", { applied: [applied("g-3", 2051449)], rejected: ["g-1", "g-2", "g-4"], review_rev: 2 }, "revit", deps);
    const want = fx.late_reply;
    expect(out.status).toBe(want.status);
    expect(out.review_rev).toBe(want.review_rev);
    expect(out.result.review_rev_seen).toEqual(want.result.review_rev_seen); // {value: 2, claimed: true} — the client's claim (C2)
    expect(out.result.declined_on_web).toEqual(want.result.declined_on_web);
    expect(out.result.applied_over_late_decline).toEqual(want.result.applied_over_late_decline);
    expect(out.result.applied_over_decline_unchecked).toEqual(want.result.applied_over_decline_unchecked);
    expect(deps.audit.mock.calls[0][6]).toMatchObject({ status: "partially_applied", declined_on_web: 1, applied_over_late_decline: want.result.applied_over_late_decline });
    expect(deps.audit.mock.calls[0][6]).not.toHaveProperty("applied_over_decline_unchecked");
    // C8: "late" rests on the client's claimed revision — the hash-chained row says so, not only the doc.
    expect(deps.audit.mock.calls[0][6].review_rev_seen).toEqual({ value: 2, claimed: true });
  });

  it("MA-3b2, the shared fixture: Revit's reason per declined ghost is stored on the result and rides on the changeset_applied row; a result without one stores none", async () => {
    const rr = fx.revit_reasons;
    const deps = seeded(fx.after);
    const out = await reportResult("demo", "cs-ma3a", rr.result, "revit", deps);
    expect(out.status).toBe("partially_applied");
    expect(out.result.reasons).toEqual(rr.stored);
    expect(deps.saved.get("cs-ma3a").result.reasons).toEqual(rr.stored);
    expect(out.result.declined_on_web.map((x) => x.proposal_guid)).toEqual(["g-1", "g-4"]); // the web's reasons stand beside Revit's
    expect(deps.audit.mock.calls[0][6]).toMatchObject({ status: "partially_applied", rejected: 3, note: "GR-FFL reviewed in Revit", reasons: rr.stored });
    const plain = seeded(fx.after);
    const none = await reportResult("demo", "cs-ma3a", { ...rr.result, reasons: undefined }, "revit", plain);
    expect(none.result).not.toHaveProperty("reasons");
    expect(plain.audit.mock.calls[0][6]).not.toHaveProperty("reasons");
  });

  it("MA-3b2: a reason for a ghost the result does not reject, or one that is not one line, is a 400 — nothing is written and no row", async () => {
    const rr = fx.revit_reasons;
    const deps = seeded(fx.after);
    await expect(reportResult("demo", "cs-ma3a", { ...rr.result, reasons: { "g-2": "applied, not declined" } }, "revit", deps))
      .rejects.toMatchObject({ status: 400, message: 'reasons names "g-2", which this result does not reject — a reason is for a declined ghost' });
    await expect(reportResult("demo", "cs-ma3a", { ...rr.result, reasons: { "g-3": "two\nlines" } }, "revit", deps))
      .rejects.toMatchObject({ status: 400, message: "a reason is one line of at most 500 characters" });
    expect(deps.docReplaceIfField).not.toHaveBeenCalled();
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("a result without review_rev (an add-in before MA-3a, a script) lands; a decline it applied is recorded as unchecked, never late (C2)", async () => {
    const deps = seeded(fx.after);
    const out = await reportResult("demo", "cs-ma3a", { applied: [applied("g-1"), applied("g-2", 8)], rejected: ["g-3", "g-4"] }, "revit", deps);
    expect(out.result.review_rev_seen).toBeNull();
    expect(out.result.applied_over_late_decline).toEqual([]);
    expect(out.result.applied_over_decline_unchecked.map((x) => x.proposal_guid)).toEqual(["g-1"]);
    const row = deps.audit.mock.calls[0][6];
    expect(row.applied_over_decline_unchecked.map((x) => x.proposal_guid)).toEqual(["g-1"]);
    expect(row.unchecked_why).toBe("the reporting client sent no review_rev — the bridge cannot tell whether it saw the decline");
    expect(row).not.toHaveProperty("applied_over_late_decline");
  });
});

describe("MA-3a — the routes", () => {
  it("POST /changesets/:key/:id/review and /reopen reach the store, as a person on the web (actor fallback web)", () => {
    const src = readFileSync(new URL("./bcf-service.mjs", import.meta.url), "utf8");
    expect(src).toContain('if (p2 && p3 === "review" && req.method === "POST") return send(res, 200, await ch.reviewChangeset(key, p2, body, actor));');
    expect(src).toContain('if (p2 && p3 === "reopen" && req.method === "POST") return send(res, 200, await ch.reopenGhost(key, p2, body, actor));');
    expect(src).toContain('const actor = body.actor || (["result", "reverted"].includes(p3) ? "revit" : ["review", "reopen"].includes(p3) ? "web" : "agent");');
  });
});
