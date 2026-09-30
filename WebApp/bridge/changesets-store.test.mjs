import { describe, it, expect, vi } from "vitest";
import { proposeChangeset, getChangeset, reportResult, withdrawChangeset, listChangesets, reportReverted } from "./changesets-store.mjs";

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
    docReplaceIfStatus: vi.fn(async (store, pid, id, data) => { saved.set(id, data); return data; }),
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

describe("CAS guard — concurrent result/withdraw cannot both land", () => {
  const casDeps = () => {
    const deps = baseDeps();
    // Simulate the race: the conditional write says "status was no longer proposed" (0 rows),
    // and the re-read shows a completed changeset written by the concurrent winner.
    deps.docReplaceIfStatus = vi.fn(async () => null);
    return deps;
  };

  it("reportResult: a lost CAS is a 409 carrying the winner's status, and audits NOTHING", async () => {
    const deps = baseDeps();
    deps.docReplaceIfStatus = vi.fn(async () => null);
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
    deps.docReplaceIfStatus = vi.fn(async () => null);
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    deps.audit.mockClear();
    deps.saved.set(cs.id, { ...cs, status: "applied" });
    await expect(withdrawChangeset("demo", cs.id, "agent", deps))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/applied/) });
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("the happy path still works when the CAS wins", async () => {
    const deps = baseDeps();
    deps.docReplaceIfStatus = vi.fn(async (store, pid, id, data) => { deps.saved.set(id, data); return data; });
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    const guids = cs.elements.map((e) => e.proposal_guid);
    const out = await reportResult("demo", cs.id, { applied: [], rejected: guids }, "r", deps);
    expect(out.status).toBe("declined");
    expect(deps.docReplaceIfStatus.mock.calls[0][4]).toBe("proposed"); // expectedStatus threaded
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
    deps.docReplaceIfStatus = vi.fn(async () => null);
    await expect(reportResult("demo", cs.id, { applied: [], rejected: guids }, "r", deps))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/withdrawn/) });
    expect(deps.docReplaceIfStatus).toHaveBeenCalledOnce(); // the PATCH genuinely ran and lost
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
    expect(deps.docReplaceIfStatus).not.toHaveBeenCalled();
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
    expect(deps.docReplaceIfStatus).not.toHaveBeenCalled();
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
    deps.docReplaceIfStatus.mockClear();
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
    expect(deps.docReplaceIfStatus).not.toHaveBeenCalled();
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
    expect(deps.docReplaceIfStatus).not.toHaveBeenCalled();
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
