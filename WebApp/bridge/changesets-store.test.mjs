import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { proposeChangeset, getChangeset, reportResult, withdrawChangeset, listChangesets, reportReverted, needsTyping, needsCiting,
  reviewChangeset, reopenGhost, previewChangesets, proposeFromJob, verifyChangeset } from "./changesets-store.mjs";
import { meshFaces } from "./survey-plan.mjs";
import { boxMesh } from "./fixtures/box-mesh.mjs";

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

describe("MA-3b3 — a decline carried to the next filing (the bridge stamps it at filing)", () => {
  const retype = (n, type = "BDS_EXT_ARC_CMU_200 mm") => ({ kind: "wall", op: "retype",
    target: { unique_id: `5a1c2b3d-1111-2222-3333-444455556666-0004c40${n}`, type_before: "Generic - 200mm" },
    place: { TypeName: type }, validate: { identity: { Class: "IFCWALL", Name: `W ${n}` } } });
  const STOREY = () => ({ name: "Promote (DD) · GR-FFL", source: "promote", elements: [retype(1), retype(2), retype(3)] });
  const rows = (deps, action) => deps.audit.mock.calls.filter((c) => c[3] === action);
  /** A filed and reported: W 1 rejected with a reason, W 2 rejected with none, W 3 applied. The report is a signed-in member's
   *  (`role`), or — with null — the machine credential's (C1). Answers {deps, A}. */
  const declinedInRevit = async (role = "contributor") => {
    const deps = baseDeps({ audit: vi.fn(async () => ({ id: 1, hash: "ab".repeat(32) })) });
    const A = await proposeChangeset("demo", STOREY(), "modeller", deps);
    const [g1, g2, g3] = A.elements.map((e) => e.proposal_guid);
    if (role) deps.myRole = as(role);
    await reportResult("demo", A.id, { applied: [{ proposal_guid: g3, revit_element_id: 5 }], rejected: [g1, g2], review_rev: 0, reasons: { [g1]: "W 1 stays as modelled" } }, "modeller", deps);
    delete deps.myRole;
    return { deps, A };
  };

  it("a ghost Revit declined before with a reason is filed already declined, with the reason, who and where from; ONE row says how many", async () => {
    const { deps, A } = await declinedInRevit();
    expect(A.carry).toBeUndefined();
    expect(A.elements.some((e) => e.review)).toBe(false);
    expect(rows(deps, "changeset_proposed")[0][6]).not.toHaveProperty("carried");
    const told = deps.saved.get(A.id).result;
    expect(told.reported_role).toBe("contributor"); // C1: the role the bridge read for the reporter, stored with the result

    const B = await proposeChangeset("demo", STOREY(), "modeller", deps);
    expect(B.review_rev).toBe(0);
    expect(B.elements[0].review).toEqual({ state: "declined", action: "decline", reason: "W 1 stays as modelled", by: told.reported_by, role: "contributor", at: told.reported_at, rev: 0,
      carried_from: { changeset: A.id, name: "Promote (DD) · GR-FFL", proposal_guid: A.elements[0].proposal_guid, origin: "revit" } });
    expect(B.elements[1].review).toBeUndefined(); // rejected before with no reason of its own: not carried, counted
    expect(B.elements[2].review).toBeUndefined(); // applied before
    expect(B.carry).toEqual({ carried: 1, no_reason: 1, creates: 0, unverified: 0 });
    expect(deps.saved.get(B.id)).toEqual(B);
    const proposed = rows(deps, "changeset_proposed");
    expect(proposed).toHaveLength(2); // one row per filing — the carry rides on it
    expect(proposed[1][6]).toMatchObject({ elements: 3, carried: 1, not_carried: { no_reason: 1, creates: 0, unverified: 0 },
      carried_from: [{ proposal_guid: B.elements[0].proposal_guid, name: 'retype wall "W 1"', origin: "revit", from: A.id, from_name: "Promote (DD) · GR-FFL", from_guid: A.elements[0].proposal_guid }] });
  });

  it("C1: a reason reported under the machine credential is never a decline — whatever name the caller posts: nothing is carried, and it is counted and said", async () => {
    const { deps, A } = await declinedInRevit(null);
    expect(deps.saved.get(A.id).result.reported_role).toBe("service");
    const B = await proposeChangeset("demo", STOREY(), "modeller", deps);
    expect(B.elements.some((e) => e.review)).toBe(false);
    expect(B.carry).toEqual({ carried: 0, no_reason: 1, creates: 0, unverified: 1 });
    expect(rows(deps, "changeset_proposed")[1][6]).toMatchObject({ carried: 0, carried_from: [], not_carried: { no_reason: 1, creates: 0, unverified: 1 } });
  });

  it("a result that applies the carried ghost is a 409 that says where it was declined — with or without a review_rev (C6); nothing is written", async () => {
    const { deps } = await declinedInRevit();
    const B = await proposeChangeset("demo", STOREY(), "modeller", deps);
    const [g1, g2, g3] = B.elements.map((e) => e.proposal_guid);
    const by = B.elements[0].review.by;
    await expect(reportResult("demo", B.id, { applied: [{ proposal_guid: g1, revit_element_id: 7 }], rejected: [g2, g3], review_rev: 0 }, "modeller", deps))
      .rejects.toMatchObject({ status: 409, message: `retype wall "W 1" was declined in Revit by ${by} (contributor) in "Promote (DD) · GR-FFL" and carried here by the bridge: "W 1 stays as modelled" — the changeset was filed with it declined (review_rev 0); Revit refuses that tick, so this result is refused. Nothing was recorded; the changeset stays proposed` });
    await expect(reportResult("demo", B.id, { applied: [{ proposal_guid: g1, revit_element_id: 7 }], rejected: [g2, g3] }, "a-script", deps))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining("the changeset was filed with it declined (review_rev 0)") });
    expect(deps.saved.get(B.id).status).toBe("proposed");
  });

  it("a lead re-opens a carried decline as any decline (the row says it was carried), and the next filing does not carry it", async () => {
    const { deps, A } = await declinedInRevit();
    const B = await proposeChangeset("demo", STOREY(), "modeller", deps);
    deps.myRole = as("lead");
    const out = await reopenGhost("demo", B.id, { proposal_guid: B.elements[0].proposal_guid, reason: "W 1 is retyped after all" }, "lead@example.com", deps);
    delete deps.myRole;
    expect(out.changeset.elements[0].review).toMatchObject({ state: "proposed", action: "reopen" });
    expect(rows(deps, "changeset_reopened")[0][6]).toMatchObject({ declined_reason: "W 1 stays as modelled", carried_from: { changeset: A.id, origin: "revit" } });
    await withdrawChangeset("demo", B.id, "modeller", deps);
    const C = await proposeChangeset("demo", STOREY(), "modeller", deps);
    expect(C.elements.some((e) => e.review)).toBe(false);
    expect(C.carry).toEqual({ carried: 0, no_reason: 1, creates: 0, unverified: 0 });
  });

  it("the match is the bridge's: a posted review neither claims a decline nor clears one", async () => {
    const { deps } = await declinedInRevit();
    const body = STOREY();
    body.elements[0].review = { state: "proposed", action: "reopen", reason: "cleared by the caller" };
    body.elements[2].review = { state: "declined", action: "decline", reason: "claimed by the caller", by: "x", role: "lead" };
    const B = await proposeChangeset("demo", body, "modeller", deps);
    expect(B.elements[0].review).toMatchObject({ state: "declined", reason: "W 1 stays as modelled" });
    expect(B.elements[2].review).toBeUndefined();
    expect(B.ignored.map((x) => x.field)).toEqual(["elements[0].review", "elements[2].review"]);
  });

  it("C12: a web decline Revit applied late (over a decline it could not see) and may then Undo is not erased — the next filing carries it; the Undo writes no doc field and need not", async () => {
    const deps = baseDeps({ audit: vi.fn(async () => ({ id: 1, hash: "ab".repeat(32) })), takeWriteBudget: vi.fn() });
    const A = await proposeChangeset("demo", STOREY(), "modeller", deps);
    const [g1, g2, g3] = A.elements.map((e) => e.proposal_guid);
    deps.myRole = as("contributor", "contributor");
    await reviewChangeset("demo", A.id, { decisions: [{ proposal_guid: g1, decision: "decline", reason: "W 1 is a party wall" }] }, "reviewer@example.com", deps);
    const out = await reportResult("demo", A.id, { applied: [{ proposal_guid: g1, revit_element_id: 7 }, { proposal_guid: g2, revit_element_id: 8 }, { proposal_guid: g3, revit_element_id: 9 }], rejected: [], review_rev: 0 }, "modeller", deps);
    delete deps.myRole;
    expect(out.result.applied_over_late_decline.map((x) => x.proposal_guid)).toEqual([g1]);
    await reportReverted("demo", A.id, { op: "undo", guids: [g1] }, "modeller", deps);
    const B = await proposeChangeset("demo", STOREY(), "modeller", deps);
    expect(B.elements[0].review).toMatchObject({ state: "declined", reason: "W 1 is a party wall", by: "reviewer@example.com", role: "contributor", rev: 0, carried_from: { changeset: A.id, proposal_guid: g1, origin: "web" } });
    expect(B.elements[1].review).toBeUndefined(); // applied over no decline: cleared, as before
    expect(B.carry).toEqual({ carried: 1, no_reason: 0, creates: 0, unverified: 0 });
  });

  it("C14: the changeset_applied row says how many of the declines the result rejected were carried (declined_before) — a Revit-origin one is never the web's alone", async () => {
    const { deps } = await declinedInRevit();
    const B = await proposeChangeset("demo", STOREY(), "modeller", deps);
    const [g1, g2, g3] = B.elements.map((e) => e.proposal_guid);
    await reportResult("demo", B.id, { applied: [{ proposal_guid: g2, revit_element_id: 7 }, { proposal_guid: g3, revit_element_id: 8 }], rejected: [g1], review_rev: 0 }, "modeller", deps);
    const applied = rows(deps, "changeset_applied");
    expect(applied[1][6]).toMatchObject({ declined_on_web: 1, declined_before: 1 });
    expect(applied[0][6]).not.toHaveProperty("declined_before"); // A's report: nothing carried, the row reads as before (E4)
  });

  it("the earlier changesets not read: a 503 in words, and nothing is filed — no referee row, no changeset, no ledger row", async () => {
    const deps = baseDeps({ docList: vi.fn(async () => { throw new Error("timeout"); }) });
    await expect(proposeChangeset("demo", STOREY(), "modeller", deps)).rejects.toMatchObject({ status: 503,
      message: "the project's earlier changesets could not be read (timeout) — nothing was filed: a decline made before could not be carried to this changeset; send it again" });
    expect(deps.adjudicateProposal).not.toHaveBeenCalled();
    expect(deps.docInsert).not.toHaveBeenCalled();
    expect(deps.audit).not.toHaveBeenCalled();
  });
});

describe("MA-3b6 — a preview of what a filing would carry (nothing stored)", () => {
  const retype = (n, type = "BDS_EXT_ARC_CMU_200 mm") => ({ kind: "wall", op: "retype",
    target: { unique_id: `5a1c2b3d-1111-2222-3333-444455556666-0004c40${n}`, type_before: "Generic - 200mm" },
    place: { TypeName: type }, validate: { identity: { Class: "IFCWALL", Name: `W ${n}` } } });
  const STOREY = () => ({ name: "Promote (DD) · GR-FFL", source: "promote", elements: [retype(1), retype(2), retype(3)] });
  const declinedInRevit = async (role = "contributor") => {
    const deps = baseDeps({ audit: vi.fn(async () => ({ id: 1, hash: "ab".repeat(32) })) });
    const A = await proposeChangeset("demo", STOREY(), "modeller", deps);
    const [g1, g2, g3] = A.elements.map((e) => e.proposal_guid);
    if (role) deps.myRole = as(role);
    await reportResult("demo", A.id, { applied: [{ proposal_guid: g3, revit_element_id: 5 }], rejected: [g1, g2], review_rev: 0, reasons: { [g1]: "W 1 stays as modelled" } }, "modeller", deps);
    delete deps.myRole;
    return { deps, A };
  };

  it("says what filing would carry and stores, audits and adjudicates nothing", async () => {
    const { deps } = await declinedInRevit();
    const saved = deps.saved.size, audits = deps.audit.mock.calls.length, adjs = deps.adjudicateProposal.mock.calls.length;
    deps.myRole = as("contributor");
    expect(await previewChangesets("demo", { bodies: [STOREY()] }, deps)).toEqual({ previews: [
      { name: "Promote (DD) · GR-FFL", elements: 3, carried: 1, no_reason: 1, creates: 0, unverified: 0, all_carried: false }] });
    expect(deps.saved.size).toBe(saved);
    expect(deps.audit.mock.calls.length).toBe(audits);
    expect(deps.adjudicateProposal.mock.calls.length).toBe(adjs);
  });

  it("a body of only the declined ghost is all_carried; two bodies answer two previews in order", async () => {
    const { deps } = await declinedInRevit();
    deps.myRole = as("contributor");
    const r = await previewChangesets("demo", { bodies: [{ ...STOREY(), elements: [retype(1)] }, STOREY()] }, deps);
    expect(r.previews.map((p) => p.all_carried)).toEqual([true, false]);
    expect(r.previews.map((p) => p.elements)).toEqual([1, 3]);
  });

  it("C1: a reason the machine credential reported is not carried, it is unverified", async () => {
    const { deps } = await declinedInRevit(null);
    deps.myRole = as("contributor");
    const r = await previewChangesets("demo", { bodies: [STOREY()] }, deps);
    expect(r.previews[0]).toMatchObject({ carried: 0, unverified: 1 });
  });

  it("refuses a body that is not bodies, a store it cannot read, and a body a filing would refuse", async () => {
    const msg = "a preview is { bodies: [1 to 50 changeset bodies] } — nothing was read";
    await expect(previewChangesets("demo", {}, baseDeps())).rejects.toMatchObject({ status: 400, message: msg });
    await expect(previewChangesets("demo", { bodies: [] }, baseDeps())).rejects.toMatchObject({ status: 400, message: msg });
    await expect(previewChangesets("demo", { bodies: [STOREY()] }, baseDeps({ docList: vi.fn(async () => { throw new Error("Supabase 500"); }) })))
      .rejects.toMatchObject({ status: 503, message: "the project's earlier changesets could not be read (Supabase 500) — nothing was previewed" });
    await expect(previewChangesets("demo", { bodies: [{ ...STOREY(), name: "" }] }, baseDeps())).rejects.toMatchObject({ status: 400 });
  });
});

describe("proposeFromJob (MA-4d): a lead turns a trusted survey job into changesets per storey; the bridge builds and stamps them", () => {
  const RESULT = readRepo("WebApp/bridge/fixtures/survey/job-0002-result.json");
  const EV = "e1".repeat(32);
  const TRUSTED = { job: { id: "job-0002", pack_id: "evp-9999", status: "done" }, result: RESULT, // job.json's pack id is never read: the row's is
    row: { ledger: { id: 2201, hash: "13".repeat(32) }, reader: "sentinel-survey", version: "0.1.0", pack_id: "evp-0001", items: [{ id: "ev-0001", sha256: EV }, { id: "ev-0002", sha256: "e2".repeat(32) }],
      read: ["ev-0001"], result_sha256: "70c9845a19417feb6c483674f0e1359911a46d630adb3135491d95618c0397d0" } };
  const STD = { guideline: readRepo("demo/bds-pilot/bds-dd-layerfree-guideline.json"), type_catalog: readRepo("demo/bds-pilot/bds-type-catalog.json") };
  const resolving = (have) => vi.fn(async (key, kind) => (have[kind] ? installed(kind, have[kind]) : NONE));
  const belowMin = (you) => vi.fn(async (_key, min) => { throw Object.assign(new Error(`this action requires the ${min} role (you are ${you})`), { status: 403 }); });
  const FRAME = { dx_mm: 40000, dy_mm: 0, dz_mm: 0, rotation_deg: 0 };
  const sdeps = (over = {}) => { let n = 3000; return baseDeps({
    myRole: vi.fn(async () => "lead"), requireMinRole: vi.fn(async () => "lead"), takeWriteBudget: vi.fn(), resolveArtefact: resolving(STD),
    trustedJob: vi.fn(async () => TRUSTED), readPack: vi.fn(async () => ({ pack: { items: [{ id: "ev-0001", sha256: EV, state: "admitted" }] } })),
    manifestLevels: vi.fn(async () => [{ name: "GR-FFL", elevation_mm: 0, from: "ARC.ifc P01" }]),
    audit: vi.fn(async () => ({ id: ++n, hash: "ab".repeat(32) })), ...over }); };
  const propose = (deps, body = { frame: FRAME }) => proposeFromJob("ma4c-drill", "job-0002", body, "web", deps);
  /** job-0002's two storey changesets as a first proposal stores them — the earlier changesets of the decision-19 cases. */
  const firstDocs = async () => { const d0 = sdeps(); await propose(d0); return [...d0.saved.values()]; };

  it("(a) one changeset per storey, built and stamped by the bridge; the gaps in one type_gap row; then the planner's build:run row", async () => {
    const deps = sdeps();
    const r = await propose(deps);
    expect(r.changesets.map((c) => [c.name, c.elements, c.preticked])).toEqual([["Survey job-0002 · GR-FFL", 3, 3], ["Survey job-0002 · Scan L01 job-0002", 4, 4]]);
    expect(r.storeys.map((s) => [s.cid, s.level, s.how, s.checked, s.changeset != null])).toEqual([["scan-L00-level", "GR-FFL", "matched", true, true], ["scan-L01-level", "Scan L01 job-0002", "created", true, true]]);
    expect(r).toMatchObject({ job: "job-0002", survey_row: { id: 2201 }, gaps: { groups: 3, elements: 6, ledger: { id: 3003 } }, already_filed: 0, overlaps: [], ledger: { id: 3004 } });
    expect([...deps.saved.values()][0]).toMatchObject(readRepo("WebApp/bridge/fixtures/changeset-ops/contract2-survey.json").stored); // Trust.cs reads the same
    expect(deps.audit.mock.calls.map((c) => [c[1], c[3]])).toEqual([["changeset", "changeset_proposed"], ["changeset", "changeset_proposed"],
      ["type_gap", "type_gap:run job-0002 · survey-planner · 3 group(s), 6 element(s)"], ["build", "build:run job-0002 · survey-planner 0.1.0 · proposed"]]);
    expect(deps.audit.mock.calls[0][6]).toMatchObject({ claimed: false, job: { id: "job-0002", ledger_id: 2201 }, evidence: [{ id: "ev-0001", sha256: EV }],
      from_job: [{ cid: "scan-L00-wall-1", evidence: ["ev-0001#slice-L00"] }, { cid: "scan-L00-wall-2" }, { cid: "scan-L00-wall-3" }] });
    expect(deps.audit.mock.calls[2][6]).toMatchObject({ claimed: false, source: "sentinel-survey", job: { id: "job-0002", ledger_id: 2201 },
      groups: [{ want: "BDS_EXT_ARC_CMU_250 mm", evidence: ["ev-0001#slice-L00", "ev-0001#slice-L01"] }, { category: "Floors" }, { category: "Ceilings" }] });
    expect(deps.audit.mock.calls[3][6]).toMatchObject({ job_id: "job-0002", survey_row: { id: 2201 }, frame: FRAME, claimed: false, model_calls: 0, tokens: 0, gaps: { groups: 3, elements: 6 } });
  });
  it("(b) refused before anything is written, each in words", async () => {
    const quiet = async (over, message, status = 409, body = { frame: FRAME }) => {
      const deps = sdeps(over);
      await expect(propose(deps, body)).rejects.toMatchObject({ status, message });
      expect([deps.docInsert.mock.calls.length, deps.audit.mock.calls.length, deps.adjudicateProposal.mock.calls.length]).toEqual([0, 0, 0]);
    };
    await quiet({ myRole: vi.fn(async () => "service") }, "proposing from a survey job needs a person — the frame and levels it states are a lead's, and its pre-ticks rest on them: sign in. Nothing was saved.", 403);
    await quiet({ requireMinRole: belowMin("contributor") }, "this action requires the lead role (you are contributor) — proposing from a survey job is a lead's: the frame and levels it states decide where every ghost lands; nothing was saved", 403);
    await quiet({ trustedJob: vi.fn(async () => { throw Object.assign(new Error("job-0002's result is not trusted: … — run the survey again; nothing was saved"), { status: 409 }); }) },
      "job-0002's result is not trusted: … — run the survey again; nothing was saved");
    await quiet({}, "pretick is not a proposal field — the bridge builds every changeset from the job's own result; send {frame, levels?} — nothing was saved", 400, { frame: FRAME, pretick: true });
    const pack = (items) => ({ readPack: vi.fn(async (_k, id) => (id === "evp-0001" ? { pack: { items } } : null)) }); // the ROW's pack id
    await quiet(pack([{ id: "ev-0001", sha256: EV, state: "changed" }]), "ev-0001 is not the bytes job-0002 read (Re-check flagged it changed) — survey the admitted scan again; nothing was saved");
    await quiet(pack([{ id: "ev-0001", sha256: "f".repeat(64), state: "admitted" }]), "ev-0001 is not the bytes job-0002 read (its sha256 in the pack is not the one the job read) — survey the admitted scan again; nothing was saved");
    await quiet(pack([]), "ev-0001 is not the bytes job-0002 read (it is no longer in the pack) — survey the admitted scan again; nothing was saved");
    await quiet({ readPack: vi.fn(async () => { throw Object.assign(new Error("ma4c-drill has no evidence pack — an office row holds none"), { status: 409 }); }) },
      "ma4c-drill has no evidence pack — an office row holds none — nothing was saved"); // a callee's words get the house ending
    const docs = await firstDocs();
    await quiet({ docList: vi.fn(async () => docs) }, "nothing new to propose from job-0002 — every candidate that types is filed already (Survey job-0002 · GR-FFL: proposed; Survey job-0002 · Scan L01 job-0002: proposed): withdraw a proposed one on the Review desk to propose it again; an applied one stays applied here after an Undo in Revit — run the survey again to propose it afresh; nothing was saved");
    await quiet({ docList: vi.fn(async () => docs.map((c) => ({ ...c, status: "applied" }))) }, expect.stringContaining("(Survey job-0002 · GR-FFL: applied; Survey job-0002 · Scan L01 job-0002: applied)"));
    await quiet({ docList: vi.fn(async () => docs) }, "Survey job-0002 · GR-FFL (proposed) was filed from job-0002 with the scan moved 40000, 0, 0 mm, turned 0° — send that frame (one job is one frame), or run the survey again to propose it afresh; nothing was saved", 409, { frame: { ...FRAME, dx_mm: 0 } });
    const other = docs.map((c) => ({ ...c, name: c.name.replace("job-0002", "job-0001"), job: { ...c.job, id: "job-0001", ledger_id: 2200 } }));
    await quiet({ docList: vi.fn(async () => other) }, "Survey job-0001 · GR-FFL (from job-0001) is still proposed — decide or withdraw it before proposing another survey job: both would propose the same walls; nothing was saved");
    await quiet({ resolveArtefact: resolving({ guideline: STD.guideline }) }, expect.stringMatching(/^a survey's candidates are typed from the project's guideline and type catalogue, exactly \(D16\) — guideline: guideline@1 · office · .+; type catalogue: none — .+; install both on the project or its office first\. Nothing was saved$/));
    await quiet({ manifestLevels: vi.fn(async () => { throw new Error("the manifest store is down"); }) },
      "the published models' levels could not be read (the manifest store is down) — nothing was saved; send it again", 503);
  });
  it("(c) a job whose changesets were withdrawn or declined is proposed again (a wrong frame is fixed that way)", async () => {
    const deps = sdeps({ docList: vi.fn(async () => [{ id: "c0", name: "Survey job-0002 · GR-FFL", status: "withdrawn", job: { id: "job-0002", ledger_id: 2201 } }]) });
    expect((await propose(deps)).changesets).toHaveLength(2);
  });
  it("(d) a level the lead names that no published model holds: its height is not checked, so nothing on that storey is pre-ticked", async () => {
    const deps = sdeps({ manifestLevels: vi.fn(async () => []) });
    const r = await propose(deps, { frame: FRAME, levels: { "scan-L00-level": "GR-FFL" } });
    expect(r.changesets.map((c) => c.preticked)).toEqual([0, 4]);
    expect([...deps.saved.values()][0].job.storey).toMatchObject({ level: "GR-FFL", how: "named", checked: false });
  });
  it("(e) Revit's result on a survey changeset: changeset_applied names the job, the evidence shas and each placed wall's reader id and evidence", async () => {
    const deps = sdeps();
    await propose(deps);
    const cs = [...deps.saved.values()][0];
    await reportResult("ma4c-drill", cs.id, { applied: cs.elements.map((e, i) => ({ proposal_guid: e.proposal_guid, revit_element_id: 900 + i, revit_unique_id: `u-${i}` })), rejected: [], review_rev: 0 }, "revit", deps);
    expect(deps.audit.mock.calls.at(-1)[6]).toMatchObject({ status: "applied", job: { id: "job-0002", ledger_id: 2201 }, evidence: [{ id: "ev-0001", sha256: EV }],
      from_job: [{ cid: "scan-L00-wall-1", evidence: ["ev-0001#slice-L00"], revit_unique_id: "u-0" }, { cid: "scan-L00-wall-2" }, { cid: "scan-L00-wall-3" }] });
  });
  it("(f) a filing the store stops half way says what WAS filed (the store listed again) and what to do", async () => {
    const deps = sdeps(); let n = 0; const insert = deps.docInsert;
    deps.docInsert = vi.fn(async (...a) => { if (++n === 2) throw new Error("the store is down"); return insert(...a); });
    await expect(propose(deps)).rejects.toMatchObject({ status: 502,
      message: "Survey job-0002 · GR-FFL was filed; the filing stopped at Survey job-0002 · Scan L01 job-0002 (the store is down) — withdraw it on the Review desk, then propose job-0002 again" });
  });
  it("(g) the type-gap row failing after the filing says what was filed — never a raw 5xx (decision 19 would refuse the retry)", async () => {
    const deps = sdeps(); let n = 0; const write = deps.audit;
    deps.audit = vi.fn(async (...a) => { if (++n === 3) throw new Error("the ledger is down"); return write(...a); });
    await expect(propose(deps)).rejects.toMatchObject({ status: 502,
      message: "Survey job-0002 · GR-FFL, Survey job-0002 · Scan L01 job-0002 were filed; the type-gap row was not written (the ledger is down) — withdraw them on the Review desk, then propose job-0002 again" });
  });
  it("(h) a doc stored before its changeset_proposed row failed is named as filed (the first storey too)", async () => {
    const deps = sdeps(); deps.audit = vi.fn(async () => { throw new Error("the ledger is down"); });
    await expect(propose(deps)).rejects.toMatchObject({ status: 502,
      message: "Survey job-0002 · GR-FFL was filed; the filing stopped at Survey job-0002 · GR-FFL (the ledger is down) — withdraw it on the Review desk, then propose job-0002 again" });
  });
  it("(i) two at once (a double-click, two leads): one files, the other is a 409 before anything is written — one job never filed twice", async () => {
    const deps = sdeps();
    const [a, b] = await Promise.allSettled([propose(deps), propose(deps)]);
    expect([a.status, b.status]).toEqual(["fulfilled", "rejected"]);
    expect(b.reason).toMatchObject({ status: 409, message: "a survey proposal is being filed on ma4c-drill — try again when it ends; nothing was saved" });
    expect(deps.saved.size).toBe(2);
    expect((await propose(sdeps())).changesets).toHaveLength(2); // released when it ends
  });
  it("(j) decision 19 per candidate: GR-FFL placed in Revit, the office then adds the 250 mm type — only the walls not filed are proposed, on the levels they were filed on", async () => {
    const [gr, l1] = await firstDocs();
    const placed = { ...gr, status: "applied", result: { applied: gr.elements.map((e) => ({ proposal_guid: e.proposal_guid })), rejected: [] } };
    const W250 = { category: "Walls", family: "Basic Wall", type: "BDS_EXT_ARC_CMU_250 mm", system: true, width_mm: 250, height_mm: null, params: { "Assembly Code": "B2010" } };
    const deps = sdeps({ docList: vi.fn(async () => [placed, l1]),
      resolveArtefact: resolving({ ...STD, type_catalog: { ...STD.type_catalog, types: [...STD.type_catalog.types, W250] } }) });
    const r = await propose(deps);
    expect(r.changesets.map((c) => [c.name, c.elements, c.preticked])).toEqual([["Survey job-0002 · GR-FFL", 1, 1], ["Survey job-0002 · Scan L01 job-0002", 1, 1]]);
    expect([...deps.saved.values()].map((c) => c.elements.map((e) => [e.cid, e.place.TypeName]))).toEqual([[["scan-L00-wall-4", "BDS_EXT_ARC_CMU_250 mm"]], [["scan-L01-wall-3", "BDS_EXT_ARC_CMU_250 mm"]]]);
    expect(r.storeys.map((s) => [s.level, s.how])).toEqual([["GR-FFL", "filed"], ["Scan L01 job-0002", "filed"]]); // L01's level is not created twice
    expect(r).toMatchObject({ already_filed: 6, gaps: { groups: 2, elements: 4 } });
  });
  it("(k) the same job id from another jobs folder is another job (keyed on its row); a scan it placed is named, never refused", async () => {
    const elsewhere = (await firstDocs()).map((c) => ({ ...c, status: "applied", job: { ...c.job, ledger_id: 1999 } }));
    const deps = sdeps({ docList: vi.fn(async () => elsewhere) });
    const r = await propose(deps);
    const overlaps = [{ changeset: "Survey job-0002 · GR-FFL", job_id: "job-0002", evidence: ["ev-0001"] }, { changeset: "Survey job-0002 · Scan L01 job-0002", job_id: "job-0002", evidence: ["ev-0001"] }];
    expect(r).toMatchObject({ already_filed: 0, overlaps });
    expect(r.changesets).toHaveLength(2);
    expect([...deps.saved.values()][0].job.overlaps).toEqual(overlaps);
    expect(deps.audit.mock.calls.at(-1)[6]).toMatchObject({ overlaps });
    // the same evidence id with another sha is another scan: no overlap (matched on id AND sha, final review)
    const other = elsewhere.map((c) => ({ ...c, job: { ...c.job, evidence: [{ id: "ev-0001", sha256: "f".repeat(64) }] } }));
    const r2 = await propose(sdeps({ docList: vi.fn(async () => other) }));
    expect(r2.overlaps).toEqual([]);
    expect(r2.changesets).toHaveLength(2);
  });
});

describe("verifyChangeset (MA-4e): a signed-in contributor measures a placed survey changeset, as filed, against its job's own scan", () => {
  const STORED = readRepo("WebApp/bridge/fixtures/changeset-ops/contract2-survey.json").stored;
  const EV = "e1".repeat(32), ID = "5b1c6f3e-2a4d-4e8f-9c1a-7d2e3f4a5b6c", DIR = resolve(tmpdir(), "sentinel-ev-ma4e");
  // GR-FFL as the drill holds it: applied (#2210, reported by a signed-in lead), its level named and not checked, three walls placed.
  const CS = { ...STORED, id: ID, status: "applied", job: { ...STORED.job, storey: { ...STORED.job.storey, how: "named", checked: false, from: null, delta_mm: null } },
    elements: STORED.elements.map((e, i) => ({ ...e, proposal_guid: `g${i + 1}`, facts: { thickness_mm: [300, 200, 300][i] } })),
    result: { applied: [1, 2, 3].map((n) => ({ proposal_guid: `g${n}`, revit_element_id: 900 + n, revit_unique_id: `u${n}` })), rejected: [],
      reported_by: "lead@example.test", reported_role: "lead" } };
  const ROW = { ledger: { id: 2201, hash: "13".repeat(32) }, reader: "sentinel-survey", version: "0.1.0", pack_id: "evp-0001",
    items: [{ id: "ev-0001", sha256: EV }, { id: "ev-0002", sha256: "e2".repeat(32) }], read: ["ev-0001"], result_sha256: CS.job.result_sha256,
    params: { voxel_mm: 20, storey_min_mm: 2000 }, seed: 1 };
  const SCAN = { id: "ev-0001", kind: "scan", format: "las", path: "scans/two-storey.las", sha256: EV, state: "admitted", surveyable: true, allowed_uses: { geometry_extraction: true } };
  const NUMS = (o = {}) => ({ points: 3512, p95_mm: 3, mean_signed_mm: 0, share_within: { 50: 1, 100: 1, 200: 1 }, coverage: 0.999, ...o });
  const KNOBS = { band_mm: 400, edge_mm: 200, cell_mm: 200 };
  const DONE = (each = () => ({})) => vi.fn(async (_k, _j, p) => ({ status: "done", version: "0.1.0", refused: [], tools: [{ name: "sentinel-survey", version: "0.1.0", licence: "LicenseRef-Sentinel" }],
    result: { elements: p.elements.map((e, i) => ({ guid: e.guid, ...NUMS(each(i)) })), derived: [],
      receipt: { started: "2026-10-09T10:00:00Z", finished: "2026-10-09T10:00:02Z", cpu_s: 0.6, points_in: 47699, points_used: 47672, measure: KNOBS } } }));
  // The drill's rows: an Undo (#2211), then a Redo (#2212) — the newest decides; #2210 the report.
  const ROWS = [{ id: 2212, action: "changeset_reverted", new_value: { op: "redo", guids: ["g1", "g2", "g3"] } }, { id: 2211, action: "changeset_reverted", new_value: { op: "undo", guids: ["g1", "g2", "g3"] } },
    { id: 2210, action: "changeset_applied" }, { id: 2205, action: "changeset_proposed" }];
  // listAudit by prefix: the changeset_ rows (whole), and the newest verify:measured row (none: never measured).
  const audits = (rows = ROWS, verify = []) => vi.fn(async (_k, q) => (q.action_prefix === "verify:measured" ? { rows: verify.slice(0, 1), total: verify.length } : { rows, total: rows.length }));
  const vdeps = (over = {}, cs = CS) => { const deps = baseDeps({ myRole: vi.fn(async () => "contributor"), requireMinRole: vi.fn(async () => "contributor"), takeWriteBudget: vi.fn(),
    trustedJob: vi.fn(async () => ({ row: ROW })), readPack: vi.fn(async () => ({ pack: { items: [SCAN] }, folder: { path: DIR } })),
    listAudit: audits(), measureJob: DONE(), audit: vi.fn(async () => ({ id: 2300, hash: "ab".repeat(32) })), ...over }); deps.saved.set(ID, cs); return deps; };
  const firstRow = async () => { const deps = vdeps(); await verify(deps); return { id: 2300, new_value: deps.audit.mock.calls[0][6] }; }; // (a)'s row, as the ledger holds it
  const verify = (deps, body = { changeset: ID }) => verifyChangeset("ma4c-drill", body, "web", deps);

  it("(a) the walls Revit placed, as filed, back in the scan's frame; the job's own items, params and seed; ONE verify:measured row; no doc write", async () => {
    const deps = vdeps();
    const r = await verify(deps);
    expect(deps.measureJob.mock.calls[0]).toEqual(["ma4c-drill", "job-0002", { job_id: `measure-${ID}`,
      items: [{ id: "ev-0001", kind: "scan", path: resolve(DIR, "scans/two-storey.las"), sha256: EV }],
      params: { voxel_mm: 20, storey_min_mm: 2000, tolerances_mm: [50, 100, 200] }, seed: 1, elements: [
        { guid: "g1", faces: [[[125, 300, 0], [125, 300, 2800], [7850, 300, 0]], [[125, 0, 0], [7850, 0, 0], [125, 0, 2800]]] },
        { guid: "g2", faces: [[[125, 6000, 0], [125, 6000, 2800], [7850, 6000, 0]], [[125, 5800, 0], [7850, 5800, 0], [125, 5800, 2800]]] },
        { guid: "g3", faces: [[[7700, 150, 0], [7700, 150, 2800], [7700, 5900, 0]], [[8000, 150, 0], [8000, 5900, 0], [8000, 150, 2800]]] }] }]);
    expect(deps.listAudit.mock.calls.map((c) => c[1])).toEqual([{ entity_type: "changeset", action_prefix: "changeset_", entity_id: ID, limit: 1000 },
      { entity_type: "changeset", action_prefix: "verify:measured", entity_id: ID, limit: 1 }]);
    expect(deps.audit).toHaveBeenCalledTimes(1);
    const [pid, et, eid, action, actor, old, v] = deps.audit.mock.calls[0];
    expect([pid, et, eid, action, actor, old]).toEqual(["p1", "changeset", ID,
      "verify:measured job-0002 · sentinel-survey 0.1.0 · done · 3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured", "web", null]);
    expect(v).toMatchObject({ changeset: { id: ID, name: "Survey job-0002 · GR-FFL" }, applied_row: 2210, reverted_row: 2212,
      placed_by: { reported_by: "lead@example.test", reported_role: "lead" }, // Revit's report's provenance: the placed list is the add-in's, said so
      faces_sha256: createHash("sha256").update(JSON.stringify(deps.measureJob.mock.calls[0][2].elements)).digest("hex"),
      status: "done", job: { id: "job-0002", ledger_id: 2201, result_sha256: CS.job.result_sha256, version: "0.1.0" },
      evidence: [{ id: "ev-0001", sha256: EV }], reader: "sentinel-survey", version: "0.1.0", params: ROW.params, seed: 1, tolerances_mm: [50, 100, 200], target_mm: 20, min_coverage: 0.25,
      measure: KNOBS, reference: "as filed", frame: CS.job.frame, storey: { level: "GR-FFL", how: "named", checked: false, delta_mm: null }, sign: "+ = the scan outside the element's face",
      points_in: 47699, points_used: 47672, counts: { within_tolerance: 3, out_of_tolerance: 0, missing: 0, insufficient_data: 0, not_measured: 0 }, model_calls: 0, tokens: 0, claimed: false });
    expect(v.elements[0]).toEqual({ proposal_guid: "g1", revit_unique_id: "u1", cid: "scan-L00-wall-1", kind: "wall", reference: "as filed", status: "within_tolerance", basis: "deviation", ...NUMS() });
    expect(r).toEqual({ changeset: { id: ID, name: "Survey job-0002 · GR-FFL" }, status: "done", reference: "as filed", counts: v.counts, elements: v.elements, ledger: { id: 2300, hash: "ab".repeat(32) } });
    expect([deps.docInsert.mock.calls.length, deps.docReplaceIfField.mock.calls.length]).toEqual([0, 0]);
  });
  it("(b) the bridge's verdicts: out of tolerance, missing, and an element undone in Revit not measured — counted on the row", async () => {
    const deps = vdeps({ listAudit: audits([{ id: 2215, action: "changeset_reverted", new_value: { op: "undo", guids: ["g3"] } }, ...ROWS]),
      measureJob: DONE((i) => (i ? { points: 0, p95_mm: null, mean_signed_mm: null, share_within: null, coverage: 0 } : { p95_mm: 63, share_within: { 50: 0, 100: 1, 200: 1 } })) });
    const r = await verify(deps);
    expect(deps.measureJob.mock.calls[0][2].elements.map((e) => e.guid)).toEqual(["g1", "g2"]);
    expect(r.elements.map((e) => [e.status, e.reason ?? null])).toEqual([["out_of_tolerance", null],
      ["missing", "no scan point within 400 mm of its faces — not built where it stands, or not scanned there"], ["not_measured", "undone in Revit (ledger #2215) — nothing placed to measure"]]);
    expect(deps.audit.mock.calls[0][3]).toBe("verify:measured job-0002 · sentinel-survey 0.1.0 · done · 0 within tolerance, 1 out of tolerance, 1 missing, 0 insufficient data, 1 not measured");
  });
  it("(c) refused before the run, each in words ending 'nothing was saved' — nothing measured, no row", async () => {
    const quiet = async (over, message, status = 409, body = { changeset: ID }, cs = CS) => {
      const deps = vdeps(over, cs);
      await expect(verify(deps, body)).rejects.toMatchObject({ status, message });
      expect([deps.measureJob.mock.calls.length, deps.audit.mock.calls.length]).toEqual([0, 0]);
    };
    await quiet({ myRole: vi.fn(async () => "service") }, "measuring a changeset against its scan needs a person — it reads the whole scan, and its row names who asked: sign in. Nothing was saved.", 403);
    await quiet({ requireMinRole: vi.fn(async () => { throw Object.assign(new Error("this action requires the contributor role (you are viewer)"), { status: 403 }); }) },
      "this action requires the contributor role (you are viewer) — measuring a placed changeset against its scan is a contributor's; nothing was saved", 403);
    await quiet({}, "results is not a measure field — the bridge measures what Revit placed, as filed, against its job's own scan; send {changeset} — nothing was saved", 400, { changeset: ID, results: [] });
    await quiet({}, "changeset must be a changeset's id (a uuid) — nothing was saved", 400, { changeset: "x" });
    await quiet({}, "no changeset 00000000-0000-4000-8000-000000000000 on ma4c-drill — nothing was saved", 404, { changeset: "00000000-0000-4000-8000-000000000000" });
    await quiet({}, "Survey job-0002 · GR-FFL was not built from a survey job — there is no scan to measure it against — nothing was saved", 409, undefined, { ...CS, job: null, claimed: true });
    await quiet({}, "Survey job-0002 · GR-FFL is proposed — only what Revit placed is measured — nothing was saved", 409, undefined, { ...CS, status: "proposed" });
    await quiet({ trustedJob: vi.fn(async () => { throw Object.assign(new Error("job-0002's result is not trusted: … — run the survey again; nothing was saved"), { status: 409 }); }) },
      "job-0002's result is not trusted: … — run the survey again; nothing was saved");
    await quiet({ trustedJob: vi.fn(async () => ({ row: { ...ROW, ledger: { id: 2299, hash: "x" } } })) },
      "job-0002 on this PC is ledger #2299, not the job Survey job-0002 · GR-FFL was built from (ledger #2201) — its scan cannot be read again here — nothing was saved");
    await quiet({ trustedJob: vi.fn(async () => ({ row: { ...ROW, seed: null } })) },
      "ledger #2201 holds no params or seed — the cloud job-0002 measured cannot be read again; run the survey again — nothing was saved");
    await quiet({ readPack: vi.fn(async () => ({ pack: { items: [{ ...SCAN, state: "changed" }] }, folder: { path: DIR } })) },
      "ev-0001 is not the bytes job-0002 read (Re-check flagged it changed) — survey the admitted scan again; nothing was saved");
    await quiet({ readPack: vi.fn(async () => ({ pack: { items: [{ ...SCAN, allowed_uses: { geometry_extraction: false } }] }, folder: { path: DIR } })) },
      "ev-0001 cannot be read again (its allowed uses exclude geometry extraction) — survey the admitted scan again — nothing was saved");
    await quiet({ listAudit: vi.fn(async () => { throw new Error("timeout"); }) },
      "Survey job-0002 · GR-FFL's ledger rows could not be read (timeout) — an Undo in Revit or an earlier measure would be missed — nothing was saved", 503);
    await quiet({ listAudit: vi.fn(async () => ({ rows: ROWS, total: 1500 })) }, // a cut read could miss the newest Undo
      "Survey job-0002 · GR-FFL has more ledger rows (1500) than one read returns — an Undo in Revit could be missed — nothing was saved", 503);
    await quiet({ listAudit: audits([{ id: 2213, action: "changeset_reverted", new_value: { op: "undo", guids: ["g1", "g2", "g3"] } }, ...ROWS]) },
      "nothing of Survey job-0002 · GR-FFL can be measured: undone in Revit (ledger #2213) — nothing placed to measure — nothing was saved");
    // A replay: the newest done row was measured on these same inputs — the numbers would repeat, so no second row.
    const done = await firstRow();
    await quiet({ listAudit: audits(ROWS, [done]) },
      "Survey job-0002 · GR-FFL was measured on these same inputs as ledger #2300 — the same bytes, seed and geometry give the same numbers; nothing was saved");
    // Any changed input measures again: a Redo in Revit since (a new reverted_row), or a newest row that did not finish.
    for (const over of [{ listAudit: audits([{ id: 2216, action: "changeset_reverted", new_value: { op: "redo", guids: ["g1", "g2", "g3"] } }, ...ROWS], [done]) },
      { listAudit: audits(ROWS, [{ id: 2301, new_value: { ...done.new_value, status: "failed" } }]) }]) {
      const deps = vdeps(over);
      await verify(deps);
      expect(deps.audit).toHaveBeenCalledTimes(1);
    }
  });
  it("(d) busy: a job or a measure running is the slot's 409 — no row", async () => {
    const deps = vdeps({ measureJob: vi.fn(async () => { throw Object.assign(new Error("a survey job is already running on this bridge (one at a time) — try again when it ends; nothing was saved"), { status: 409 }); }) });
    await expect(verify(deps)).rejects.toMatchObject({ status: 409, message: "a survey job is already running on this bridge (one at a time) — try again when it ends; nothing was saved" });
    expect(deps.audit).not.toHaveBeenCalled();
  });
  it("(e) a run that starts always leaves its row: refused (409) and failed (502) name it; a result not the contract's shape, a verdict from the service and another version than the job's fail; a row the ledger refuses is a 502, nothing saved", async () => {
    const run = async (r, message, status) => {
      const deps = vdeps({ measureJob: vi.fn(async () => r) });
      await expect(verify(deps)).rejects.toMatchObject({ status, message });
      return deps.audit.mock.calls;
    };
    let rows = await run({ status: "refused", version: "0.1.0", refused: [{ id: "ev-0001", reason: "changed since admitted (its sha256 is not the pack's) — Re-check flags it" }] },
      "Survey job-0002 · GR-FFL was not measured: the scan was not read again — ev-0001: changed since admitted (its sha256 is not the pack's) — Re-check flags it — ledger #2300 records the run; nothing else was saved", 409);
    expect([rows.length, rows[0][3], rows[0][6].status, rows[0][6].elements]).toEqual([1, "verify:measured job-0002 · sentinel-survey 0.1.0 · refused", "refused", []]);
    rows = await run({ status: "failed", version: "0.1.0", error: "the survey took longer than 10 min — it was stopped; nothing it found was kept" },
      "the measure of Survey job-0002 · GR-FFL did not finish: the survey took longer than 10 min — it was stopped; nothing it found was kept — ledger #2300 records the run; nothing else was saved", 502);
    expect(rows[0][3]).toBe("verify:measured job-0002 · sentinel-survey 0.1.0 · failed");
    await run({ status: "done", version: "0.1.0", result: { elements: [{ guid: "g9" }], receipt: { measure: KNOBS } } },
      "the measure of Survey job-0002 · GR-FFL did not finish: sentinel-survey's measure is not the contract's shape (not one result per element sent) — nothing it measured was kept — ledger #2300 records the run; nothing else was saved", 502);
    // Rule 3: a verdict sent by the service is refused, never merged — p95 63 never reads within tolerance.
    const three = (o) => ["g1", "g2", "g3"].map((guid) => ({ guid, ...NUMS(), ...o }));
    rows = await run({ status: "done", version: "0.1.0", result: { elements: three({ p95_mm: 63, status: "within_tolerance" }), receipt: { measure: KNOBS } } },
      "the measure of Survey job-0002 · GR-FFL did not finish: sentinel-survey's measure is not the contract's shape (elements[0] carries status (the verdict is the bridge's)) — nothing it measured was kept — ledger #2300 records the run; nothing else was saved", 502);
    expect([rows[0][6].status, rows[0][6].elements]).toEqual(["failed", []]);
    // The job's own cloud only from the version that read it: another version may read, sample or voxel differently.
    rows = await run({ status: "done", version: "0.2.0", result: { elements: three(), receipt: { measure: KNOBS } } },
      "the measure of Survey job-0002 · GR-FFL did not finish: the job was read by sentinel-survey 0.1.0 and this measure ran 0.2.0 — its cloud is not known to be the job's; run the survey again — nothing it measured was kept — ledger #2300 records the run; nothing else was saved", 502);
    expect([rows[0][3], rows[0][6].job.version, rows[0][6].elements]).toEqual(["verify:measured job-0002 · sentinel-survey 0.2.0 · failed", "0.1.0", []]);
    await expect(verify(vdeps({ audit: vi.fn(async () => { throw new Error("ledger down"); }) }))).rejects.toMatchObject({ status: 502,
      message: "Survey job-0002 · GR-FFL was measured, but the ledger did not take its row (ledger down) — nothing was saved; measure it again" });
  });
  it("(final review) the receipt rides on the row typed, the knobs by name; shares only at the bridge's tolerances; a stray knob fails the run", async () => {
    const odd = vi.fn(async (_k, _j, p) => ({ status: "done", version: "0.1.0", refused: [], tools: [],
      result: { elements: p.elements.map((e) => ({ guid: e.guid, ...NUMS({ share_within: { 50: 1, 75: 0.5, 100: 1, 200: 1 } }) })), derived: [],
        receipt: { started: 7, finished: "x".repeat(41), cpu_s: "fast", points_in: 47699, points_used: null, measure: KNOBS, note: "kept nowhere" } } }));
    let deps = vdeps({ measureJob: odd });
    await verify(deps);
    let v = deps.audit.mock.calls[0][6];
    expect([v.status, v.started, v.finished, v.cpu_s, v.points_in, v.points_used, v.measure]).toEqual(["done", null, null, null, 47699, null, KNOBS]);
    expect(v.elements[0].share_within).toEqual({ 50: 1, 100: 1, 200: 1 }); // the 75 mm share the service sent is not the bridge's tolerance
    expect(JSON.stringify(v)).not.toContain("kept nowhere");
    deps = vdeps({ measureJob: vi.fn(async (_k, _j, p) => ({ status: "done", version: "0.1.0", refused: [], tools: [],
      result: { elements: p.elements.map((e) => ({ guid: e.guid, ...NUMS() })), derived: [], receipt: { measure: { ...KNOBS, verdict: "fine" } } } })) });
    await expect(verify(deps)).rejects.toThrow("(receipt.measure) — nothing it measured was kept — ledger #2300 records the run");
    v = deps.audit.mock.calls[0][6];
    expect([v.status, v.elements, v.measure, v.error]).toEqual(["failed", [], null, "sentinel-survey's measure is not the contract's shape (receipt.measure) — nothing it measured was kept"]);
  });
  // MA-4f: the drill's three walls as Revit's re-read sends them — a box around each filed line (the model's frame).
  const LINES = [[[40125, 150], [47850, 150]], [[40125, 5900], [47850, 5900]], [[47850, 150], [47850, 5900]]];
  const sha = (m) => createHash("sha256").update(JSON.stringify(m)).digest("hex");
  const kept = (i, t) => { const m = boxMesh(...LINES[i], t, 0, 2800); return { mesh_sha256: sha(m), ...meshFaces(CS.elements[i], m) }; };
  const withReread = (ts) => ({ ...CS, result: { ...CS.result, applied: CS.result.applied.map((a, i) => (ts[i] ? { ...a, reread: kept(i, ts[i]) } : a)) } });
  const COUNTS3 = "3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured";

  it("(f) MA-4f: Revit's result keeps each placed survey wall's re-read — its sha and two side faces, never the mesh; a mesh it cannot read is said and the result lands; a posted reread is dropped; the machine credential's mesh and a claimed changeset's are not used", async () => {
    const person = { myRole: vi.fn(async () => "contributor"), requireMinRole: vi.fn(async () => "contributor") }; // Revit signed in (H4)
    const deps = baseDeps(person);
    deps.saved.set(ID, { ...CS, status: "proposed", result: undefined });
    const W1 = boxMesh(...LINES[0], 300, 0, 2800);
    const out = await reportResult("ma4c-drill", ID, { applied: [
      { proposal_guid: "g1", revit_element_id: 901, revit_unique_id: "u1", mesh: W1 },
      { proposal_guid: "g2", revit_element_id: 902, revit_unique_id: "u2", mesh: [1, 2, 3] },
      { proposal_guid: "g3", revit_element_id: 903, revit_unique_id: "u3", reread: { mesh_sha256: "f".repeat(64), faces: [] } }], rejected: [] }, "r", deps);
    expect(out.status).toBe("applied");
    expect(out.result.applied).toEqual([
      { proposal_guid: "g1", revit_element_id: 901, revit_unique_id: "u1", reread: { mesh_sha256: sha(W1),
        faces: [[[40125, 300, 0], [40125, 300, 2800], [47850, 300, 0]], [[40125, 0, 0], [47850, 0, 0], [40125, 0, 2800]]] } },
      { proposal_guid: "g2", revit_element_id: 902, revit_unique_id: "u2", reread: { mesh_sha256: sha([1, 2, 3]), why: "not a list of triangles (9 numbers each)" } },
      { proposal_guid: "g3", revit_element_id: 903, revit_unique_id: "u3" }]); // the bridge rebuilds each entry: a posted reread is never kept
    expect(deps.audit.mock.calls.find((c) => c[3] === "changeset_applied")[6].applied).toEqual(out.result.applied);
    const machine = baseDeps({ myRole: vi.fn(async () => "service"), requireMinRole: vi.fn(async () => "service") });
    machine.saved.set(ID, { ...CS, status: "proposed", result: undefined });
    const o1 = await reportResult("ma4c-drill", ID, { applied: [{ proposal_guid: "g1", revit_element_id: 901, revit_unique_id: "u1", mesh: W1 }], rejected: ["g2", "g3"] }, "r", machine);
    expect(o1.result.applied).toEqual([{ proposal_guid: "g1", revit_element_id: 901, revit_unique_id: "u1",
      reread: { mesh_sha256: sha(W1), why: "reported with the machine credential — sign in in Revit to have it measured" } }]);
    const own = baseDeps(person);
    own.saved.set(ID, { ...CS, job: undefined, claimed: true, status: "proposed", result: undefined });
    const o2 = await reportResult("ma4c-drill", ID, { applied: [{ proposal_guid: "g1", revit_element_id: 901, revit_unique_id: "u1", mesh: W1 }], rejected: ["g2", "g3"] }, "r", own);
    expect(o2.result.applied).toEqual([{ proposal_guid: "g1", revit_element_id: 901, revit_unique_id: "u1" }]);
  });
  it("(g) MA-4f: walls Revit re-read are measured by the re-read — the row (claimed), its action line, the reply and each element say revit (claimed) and name the mesh's sha; a mix says mixed; the same faces under an as-filed row are measured again (the reference changed)", async () => {
    const filed = vdeps();
    await verify(filed);
    const FILED_SENT = filed.measureJob.mock.calls[0][2].elements;
    const RR = withReread([350, 200, 300]); // the first wall's type is 50 mm wider in Revit than its measured thickness
    const deps = vdeps({}, RR);
    const r = await verify(deps);
    const v = deps.audit.mock.calls[0][6];
    expect(deps.measureJob.mock.calls[0][2].elements).toEqual([{ guid: "g1", faces: [[[125, 325, 0], [125, 325, 2800], [7850, 325, 0]], [[125, -25, 0], [7850, -25, 0], [125, -25, 2800]]] }, ...FILED_SENT.slice(1)]);
    expect([v.reference, v.claimed, r.reference, v.elements.map((e) => [e.reference, e.mesh_sha256])])
      .toEqual(["revit (claimed)", true, "revit (claimed)", RR.result.applied.map((a) => ["revit (claimed)", a.reread.mesh_sha256])]);
    expect(deps.audit.mock.calls[0][3]).toBe(`verify:measured job-0002 · sentinel-survey 0.1.0 · done · revit (claimed) · ${COUNTS3}`);
    const mix = vdeps({}, withReread([300, 200, null]));
    await verify(mix);
    expect([mix.audit.mock.calls[0][6].reference, mix.audit.mock.calls[0][6].claimed, mix.audit.mock.calls[0][6].elements.map((e) => e.reference), mix.audit.mock.calls[0][3]])
      .toEqual(["mixed", true, ["revit (claimed)", "revit (claimed)", "as filed"], `verify:measured job-0002 · sentinel-survey 0.1.0 · done · mixed: revit (claimed) and as filed · ${COUNTS3}`]);
    const done = await firstRow(); // a done row measured as filed
    const same = vdeps({ listAudit: audits(ROWS, [done]) }, withReread([300, 200, 300]));
    await verify(same);
    expect([same.measureJob.mock.calls[0][2].elements, same.audit.mock.calls[0][6].faces_sha256, same.audit.mock.calls[0][6].reference])
      .toEqual([FILED_SENT, done.new_value.faces_sha256, "revit (claimed)"]);
  });
});
