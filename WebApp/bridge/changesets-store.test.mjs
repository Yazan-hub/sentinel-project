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
      verdict: "rejected", summary: {}, ids_source: "server", audit_id: 1,
      failures: [{ element: b.elements[1].identity.GlobalId, requirement: "FireRating" }],
    }));
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    expect(cs.elements[0].verdict.status).toBe("accepted");
    expect(cs.elements[1].verdict.status).toBe("rejected");
  });

  it("stores unattributed failures on the adjudication (a changeset-level rejection, not any one element's)", async () => {
    const deps = baseDeps();
    deps.adjudicateProposal = vi.fn(async () => ({
      verdict: "rejected", summary: {}, ids_source: "server", audit_id: 2,
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
