import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { proposeChangeset, getChangeset, reportResult, withdrawChangeset, listChangesets, reportReverted, needsTyping, needsCiting,
  reviewChangeset, reopenGhost, previewChangesets, proposeFromJob, verifyChangeset, scanOverlay, editCostOf, publishEditCost, flagChangeset } from "./changesets-store.mjs";
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
    expect(needsTyping({ elements: [{ kind: "opening", place: { LevelName: "L1", Boundary: [[0, 0], [1, 0], [1, 1]] } }] })).toBe(false); // MA-6-3: untyped
    expect(needsTyping({ elements: [{ kind: "beam", place: { LevelName: "L1" }, facts: { params: { Material: "Concrete" } } }] })).toBe(true);
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

  // MA-5b-5: a rehost removes an element — the ledger names what was removed and what replaced it; the machine credential reports none applied
  const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f9";
  const REHOST = { name: "Promote · L01", source: "promote", elements: [{ op: "rehost", kind: "door", validate: { identity: { Class: "IFCDOOR", Name: "Door 4711" } },
    target: { unique_id: UID, type_before: "Placeholder Door : 1000 x 2100", at: [44100, 2500, 6000] },
    place: { LevelName: "L01", Location: [44050, 2500, 6000], FamilyName: "BDS_INT_1 PNL", TypeName: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" } }] };
  it("MA-5b-5: an applied rehost's row names what was removed (the target) and what replaced it, with the tags Revit removed", async () => {
    const deps = baseDeps({ myRole: async () => "contributor" });
    const cs = await proposeChangeset("demo", REHOST, "lead@office.example", deps);
    const g = cs.elements[0].proposal_guid;
    const out = await reportResult("demo", cs.id, { applied: [{ proposal_guid: g, revit_element_id: 9001, revit_unique_id: "new-uid", removed_tags: 2 }], rejected: [] }, "lead@office.example", deps);
    expect(out.result.applied[0]).toMatchObject({ revit_unique_id: "new-uid", removed_tags: 2 });
    const row = deps.audit.mock.calls.find((c) => c[3] === "changeset_applied");
    expect(row[6].removed).toEqual([{ proposal_guid: g, unique_id: UID, type_before: "Placeholder Door : 1000 x 2100", replaced_by: "new-uid", tags: 2 }]);
  });
  it("MA-5b-5 review: a replacement Revit reports with the removed element's own UniqueId, or none, is not named", async () => {
    for (const uid of [UID, "", undefined]) {
      const deps = baseDeps({ myRole: async () => "contributor" });
      const cs = await proposeChangeset("demo", REHOST, "lead@office.example", deps);
      const g = cs.elements[0].proposal_guid;
      await reportResult("demo", cs.id, { applied: [{ proposal_guid: g, revit_element_id: 9001, revit_unique_id: uid }], rejected: [] }, "lead@office.example", deps);
      expect(deps.audit.mock.calls.find((c) => c[3] === "changeset_applied")[6].removed[0].replaced_by).toBeNull();
    }
  });
  it("MA-5b-5: the machine credential reports no rehost applied — a 403, nothing recorded; declining it is still a result", async () => {
    const roles = ["contributor", "service", "service", "service"];
    const deps = baseDeps({ myRole: vi.fn(async () => roles.shift() ?? "service") });
    const cs = await proposeChangeset("demo", REHOST, "lead@office.example", deps);
    const g = cs.elements[0].proposal_guid;
    await expect(reportResult("demo", cs.id, { applied: [{ proposal_guid: g, revit_element_id: 9001, revit_unique_id: "new-uid" }], rejected: [] }, "revit", deps))
      .rejects.toMatchObject({ status: 403, message: expect.stringMatching(/a rehost removes an element — its result is a signed-in member's/) });
    expect(deps.audit.mock.calls.some((c) => c[3] === "changeset_applied")).toBe(false);
    expect((await reportResult("demo", cs.id, { applied: [], rejected: [g] }, "revit", deps)).status).toBe("declined");
  });

  // MA-8-7 (D16): a create that replaces removes a DirectShape - Revit's report decides what the ledger says was removed
  const REPLACED = "5a1c2b3d-1111-2222-3333-444455556666-0004c3fa";
  const REPLACES = { name: "Promote · L01", source: "promote", elements: [{ ...wall(), replaces: { unique_id: REPLACED, box: { min: [0, 0, 0], max: [5000, 200, 3000] } } }] };
  it("MA-8-7: an applied replacing create's row lists in `removed` only what Revit reported deleted; otherwise `not_removed` says so", async () => {
    for (const reported of [REPLACED, undefined, "5a1c2b3d-1111-2222-3333-444455556666-0004c3ff"]) {
      const deps = baseDeps({ myRole: async () => "contributor" });
      const cs = await proposeChangeset("demo", REPLACES, "lead@office.example", deps);
      const g = cs.elements[0].proposal_guid;
      const out = await reportResult("demo", cs.id, { applied: [{ proposal_guid: g, revit_element_id: 9001, revit_unique_id: "new-uid", removed_tags: 1, removed_unique_id: reported }], rejected: [] }, "lead@office.example", deps);
      const row = deps.audit.mock.calls.find((c) => c[3] === "changeset_applied")[6];
      if (reported === REPLACED) {
        expect(row.removed).toEqual([{ proposal_guid: g, unique_id: REPLACED, type_before: "DirectShape or Generic Model", replaced_by: "new-uid", tags: 1 }]);
        expect(row).not.toHaveProperty("not_removed");
        expect(out.result.applied[0]).toMatchObject({ removed_tags: 1, removed_unique_id: REPLACED });
      } else {
        expect(row).not.toHaveProperty("removed");
        expect(row.not_removed).toEqual([{ proposal_guid: g, unique_id: REPLACED, why: expect.stringMatching(/did not report the original deleted/) }]);
      }
    }
  });
  it("MA-8-7 review: the removed row names the original's class (replaces.kind); none sent says both; a report naming the removed element as its replacement is not kept", async () => {
    for (const [kind, want] of [["directshape", "DirectShape"], ["generic", "Generic Model"], [undefined, "DirectShape or Generic Model"]]) {
      const deps = baseDeps({ myRole: async () => "contributor" });
      const cs = await proposeChangeset("demo", { ...REPLACES, elements: [{ ...REPLACES.elements[0], replaces: { ...REPLACES.elements[0].replaces, ...(kind ? { kind, category: "Floors" } : {}) } }] }, "lead@office.example", deps);
      const g = cs.elements[0].proposal_guid;
      await reportResult("demo", cs.id, { applied: [{ proposal_guid: g, revit_element_id: 9001, revit_unique_id: REPLACED.toUpperCase(), removed_unique_id: REPLACED }], rejected: [] }, "lead@office.example", deps);
      const r = deps.audit.mock.calls.find((c) => c[3] === "changeset_applied")[6].removed[0];
      expect(r).toMatchObject({ type_before: want, replaced_by: null });
    }
  });
  it("MA-8-7: the machine credential reports no replacing create applied - a 403, nothing recorded", async () => {
    const roles = ["contributor", "service"];
    const deps = baseDeps({ myRole: vi.fn(async () => roles.shift() ?? "service") });
    const cs = await proposeChangeset("demo", REPLACES, "lead@office.example", deps);
    await expect(reportResult("demo", cs.id, { applied: [{ proposal_guid: cs.elements[0].proposal_guid, revit_element_id: 9001 }], rejected: [] }, "revit", deps))
      .rejects.toMatchObject({ status: 403, message: expect.stringMatching(/a create that replaces removes one too/) });
    expect(deps.audit.mock.calls.some((c) => c[3] === "changeset_applied")).toBe(false);
  });
  it("MA-8-7: a replacing create from the machine credential is a 400 (a member files it)", async () => {
    await expect(proposeChangeset("demo", REPLACES, "agent", baseDeps({ myRole: async () => "service" }))).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/only a signed-in member files one/) });
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

// MA-8-7 (amendment 16): a retype is judged foreign against type_catalog@n; read only with a retype
describe("proposeChangeset - foreign retype (MA-8-7)", () => {
  const catalog = { types: [{ category: "Walls", family: "Basic Wall", type: "Generic - 200mm" }] };
  const resolving = (have) => vi.fn(async (key, kind) => (have[kind] ? installed(kind, have[kind]) : NONE));
  const retype = (before) => ({ name: "Promote", source: "promote", elements: [{ op: "retype", kind: "wall", target: { unique_id: "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8", type_before: before },
    place: { TypeName: "Generic - 200mm" }, validate: { identity: { Class: "IfcWall", Name: "W 1" } } }] });
  it("reads the catalogue only for a post with a retype; a catalogue row is pre-ticked, another office's type is not and is stored foreign", async () => {
    const none = baseDeps({ resolveArtefact: resolving({ type_catalog: catalog }), myRole: async () => "contributor" });
    await proposeChangeset("demo", BODY, "agent", none);
    expect(none.resolveArtefact).not.toHaveBeenCalled();
    const deps = baseDeps({ resolveArtefact: resolving({ type_catalog: catalog }), myRole: async () => "contributor" });
    const mine = await proposeChangeset("demo", retype("Generic - 200mm"), "lead@office.example", deps);
    expect(deps.resolveArtefact.mock.calls.map((c) => c.slice(0, 2))).toEqual([["demo", "type_catalog"]]);
    expect(mine.elements[0]).toMatchObject({ pretick: true, foreign: false });
    const theirs = await proposeChangeset("demo", retype("Aussenwand 36.5"), "lead@office.example", baseDeps({ resolveArtefact: resolving({ type_catalog: catalog }), myRole: async () => "contributor" }));
    expect(theirs.elements[0]).toMatchObject({ pretick: false, foreign: true });
  });
  it("a read that throws, or no catalogue, files the retype unjudged and not pre-ticked - never a refused filing", async () => {
    const boom = baseDeps({ resolveArtefact: vi.fn(async () => { throw new Error("db down"); }), myRole: async () => "contributor" });
    expect((await proposeChangeset("demo", retype("Generic - 200mm"), "lead@office.example", boom)).elements[0]).toMatchObject({ pretick: false, foreign: null });
    const none = baseDeps({ resolveArtefact: resolving({}), myRole: async () => "contributor" });
    expect((await proposeChangeset("demo", retype("Generic - 200mm"), "lead@office.example", none)).elements[0]).toMatchObject({ pretick: false, foreign: null });
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
    expect(src).toContain('const actor = body.actor || (["result", "reverted"].includes(p3) ? "revit" : ["review", "reopen", "flags"].includes(p3) ? "web" : "agent");');
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
    expect(r.changesets.map((c) => [c.name, c.elements, c.preticked])).toEqual([["Survey job-0002 · GR-FFL", 3, 0], ["Survey job-0002 · Scan L01 job-0002", 4, 1]]); // MA-5a-2: a created level only
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
    await quiet({ myRole: vi.fn(async () => "service") }, "proposing from a survey or drawing job needs a person — where its ghosts land (a scan's frame, a drawing's alignment) and on which level is a lead's statement: sign in. Nothing was saved.", 403);
    await quiet({ requireMinRole: belowMin("contributor") }, "this action requires the lead role (you are contributor) — proposing from a survey or drawing job is a lead's: the frame or alignment and the level it states decide where every ghost lands; nothing was saved", 403);
    await quiet({ trustedJob: vi.fn(async () => { throw Object.assign(new Error("job-0002's result is not trusted: … — run the survey again; nothing was saved"), { status: 409 }); }) },
      "job-0002's result is not trusted: … — run the survey again; nothing was saved");
    // MA-5a-4: a drawing job's own trusted row reads a drawing's body — a scan's frame is refused in words
    await quiet({ trustedJob: vi.fn(async () => ({ ...TRUSTED, row: { ...TRUSTED.row, reader: "sentinel-drawing" } })) },
      "frame is not a proposal field — a drawing is proposed with {item?, points, check?, level?, elevation_mm, revises?}; the bridge builds every changeset from the job's own result — nothing was saved", 400);
    await quiet({}, "pretick is not a proposal field — the bridge builds every changeset from the job's own result; send {frame, levels?} — nothing was saved", 400, { frame: FRAME, pretick: true });
    const pack = (items) => ({ readPack: vi.fn(async (_k, id) => (id === "evp-0001" ? { pack: { items } } : null)) }); // the ROW's pack id
    await quiet(pack([{ id: "ev-0001", sha256: EV, state: "changed" }]), "ev-0001 is not the bytes job-0002 read (Re-check flagged it changed) — survey the admitted scan again; nothing was saved");
    await quiet(pack([{ id: "ev-0001", sha256: "f".repeat(64), state: "admitted" }]), "ev-0001 is not the bytes job-0002 read (its sha256 in the pack is not the one the job read) — survey the admitted scan again; nothing was saved");
    await quiet(pack([]), "ev-0001 is not the bytes job-0002 read (it is no longer in the pack) — survey the admitted scan again; nothing was saved");
    await quiet({ readPack: vi.fn(async () => { throw Object.assign(new Error("ma4c-drill has no evidence pack — an office row holds none"), { status: 409 }); }) },
      "ma4c-drill has no evidence pack — an office row holds none — nothing was saved"); // a callee's words get the house ending
    const docs = await firstDocs();
    await quiet({ docList: vi.fn(async () => docs) }, "nothing new to propose from job-0002 — every candidate that types is filed already (Survey job-0002 · GR-FFL: proposed; Survey job-0002 · Scan L01 job-0002: proposed): decline a proposed one in Revit (Review AI Proposals → Decline all, with a reason) to propose it again; an applied one stays applied here after an Undo in Revit — run the survey again to propose it afresh; nothing was saved");
    await quiet({ docList: vi.fn(async () => docs.map((c) => ({ ...c, status: "applied" }))) }, expect.stringContaining("(Survey job-0002 · GR-FFL: applied; Survey job-0002 · Scan L01 job-0002: applied)"));
    await quiet({ docList: vi.fn(async () => docs) }, "Survey job-0002 · GR-FFL (proposed) was filed from job-0002 with the scan moved 40000, 0, 0 mm, turned 0° — send that frame (one job is one frame), or run the survey again to propose it afresh; nothing was saved", 409, { frame: { ...FRAME, dx_mm: 0 } });
    const other = docs.map((c) => ({ ...c, name: c.name.replace("job-0002", "job-0001"), job: { ...c.job, id: "job-0001", ledger_id: 2200 } }));
    await quiet({ docList: vi.fn(async () => other) }, "Survey job-0001 · GR-FFL (from job-0001) is still proposed — decide or withdraw it before proposing from another job: both could propose the same walls; nothing was saved");
    await quiet({ resolveArtefact: resolving({ guideline: STD.guideline }) }, expect.stringMatching(/^a survey's candidates are typed from the project's guideline and type catalogue \(walls, floors and ceilings exactly, D16; doors and windows by size within 100 mm\) — guideline: guideline@1 · office · .+; type catalogue: none — .+; install both on the project or its office first\. Nothing was saved$/));
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
    expect(r.changesets.map((c) => c.preticked)).toEqual([0, 1]); // MA-5a-2: L01's created level only
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
      message: "Survey job-0002 · GR-FFL was filed; the filing stopped at Survey job-0002 · Scan L01 job-0002 (the store is down) — decline it in Revit (Review AI Proposals → Decline all, with a reason), then propose job-0002 again" });
  });
  it("(g) the type-gap row failing after the filing says what was filed — never a raw 5xx (decision 19 would refuse the retry)", async () => {
    const deps = sdeps(); let n = 0; const write = deps.audit;
    deps.audit = vi.fn(async (...a) => { if (++n === 3) throw new Error("the ledger is down"); return write(...a); });
    await expect(propose(deps)).rejects.toMatchObject({ status: 502,
      message: "Survey job-0002 · GR-FFL, Survey job-0002 · Scan L01 job-0002 were filed; the type-gap row was not written (the ledger is down) — decline them in Revit (Review AI Proposals → Decline all, with a reason), then propose job-0002 again" });
  });
  it("(h) a doc stored before its changeset_proposed row failed is named as filed (the first storey too)", async () => {
    const deps = sdeps(); deps.audit = vi.fn(async () => { throw new Error("the ledger is down"); });
    await expect(propose(deps)).rejects.toMatchObject({ status: 502,
      message: "Survey job-0002 · GR-FFL was filed; the filing stopped at Survey job-0002 · GR-FFL (the ledger is down) — decline it in Revit (Review AI Proposals → Decline all, with a reason), then propose job-0002 again" });
  });
  it("(i) two at once (a double-click, two leads): one files, the other is a 409 before anything is written — one job never filed twice", async () => {
    const deps = sdeps();
    const [a, b] = await Promise.allSettled([propose(deps), propose(deps)]);
    expect([a.status, b.status]).toEqual(["fulfilled", "rejected"]);
    expect(b.reason).toMatchObject({ status: 409, message: "a proposal from a job is being filed on ma4c-drill — try again when it ends; nothing was saved" });
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
    expect(r.changesets.map((c) => [c.name, c.elements, c.preticked])).toEqual([["Survey job-0002 · GR-FFL", 1, 0], ["Survey job-0002 · Scan L01 job-0002", 1, 0]]); // MA-5a-2: walls never pre-ticked
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
  it("(l) MA-5a: the installed catalogue types a scan window by its size (one row); a door at a size of 13 rows is a gap — the stored typing names the catalogue", async () => {
    const opening = (kind, host, direction, along, Location, measured) => ({ cid: `${host}-${kind}-1`, kind, geometry: { host, storey: "scan-L00-level", direction, Location, along_mm: along },
      measured, evidence: ["ev-0001#slice-L00"], fit: { inliers: 40, rmse_mm: 0, coverage: 0.9, faces_seen: 2 } });
    const result = { ...RESULT, candidates: [...RESULT.candidates,
      opening("window", "scan-L00-wall-3", [0, 1], 2549, [7850, 2600, 0], { width_mm: 3100, height_mm: 1500, sill_mm: 600, head_mm: 2100 }),
      opening("door", "scan-L00-wall-1", [1, 0], 3465, [3450, 150, 0], { width_mm: 1000, height_mm: 2100, sill_mm: 0, head_mm: 2100 })] };
    const deps = sdeps({ trustedJob: vi.fn(async () => ({ ...TRUSTED, result })) });
    const r = await propose(deps);
    expect(r.changesets.map((c) => [c.name, c.elements, c.preticked])).toEqual([["Survey job-0002 · GR-FFL", 4, 0], ["Survey job-0002 · Scan L01 job-0002", 4, 1]]);
    const win = [...deps.saved.values()][0].elements[3];
    const planner = deps.audit.mock.calls.at(-1)[6];
    expect(win).toMatchObject({ kind: "window", cid: "scan-L00-wall-3-window-1", pretick: false, accuracy: { status: "insufficient_data", basis: "framing" },
      place: { LevelName: "GR-FFL", Location: [47850, 2600, 0], FamilyName: "BDS_Window_1 Panel", TypeName: "3100x1500 mm", SillHeight: 600 },
      typing: { typed_by: "bridge-size", type: "3100x1500 mm", family: "BDS_Window_1 Panel", size: "3100 x 1500 mm", band_mm: 100, catalog: planner.catalog, catalog_sha256: "ab".repeat(32) } });
    expect(deps.audit.mock.calls[2][6].groups.find((g) => g.category === "Doors")).toMatchObject({ want: null, size: "1000 x 2100 mm",
      key: expect.stringMatching(/^13 Doors types are named within 100 mm of 1000 x 2100 mm: BDS_EXT_1 PNL : BDS_EXT_1 PNL_GLASS_1000 x 2100 mm, /) });
    // the ledger row counts the window typed by size with the walls the typer typed (review)
    expect(deps.audit.mock.calls.filter((c) => c[3] === "changeset_proposed").map((c) => c[6].typed)).toEqual([4, 3]); // L01: its level is not typed
  });
  it("(m) drill MA5a K-3: a door held by its gap host on a storey that files no changeset is named on the planner's row; on a filed storey its changeset says it", async () => {
    const door = (host, storey, Location) => ({ cid: `${host}-door-1`, kind: "door", geometry: { host, storey, direction: [0, 1], Location, along_mm: 2000 },
      measured: { width_mm: 1000, height_mm: 2100, sill_mm: 0, head_mm: 2100 }, evidence: ["ev-0001#slice-L00"], fit: { inliers: 40, rmse_mm: 0, coverage: 0.9, faces_seen: 2 } });
    // L01 keeps only its 250 mm wall (a type gap) and its floor and ceiling (gaps): nothing on it types, so no changeset is filed for it
    const keep = RESULT.candidates.filter((c) => c.geometry?.storey !== "scan-L01-level" || c.kind !== "wall" || c.cid === "scan-L01-wall-3");
    const seenOnce = { ...door("scan-L00-wall-2", "scan-L00-level", [2000, 5900, 0]), cid: "scan-L00-wall-2-door-9", fit: { inliers: 40, rmse_mm: 0, coverage: 0.9, faces_seen: 1 } };
    const result = { ...RESULT, candidates: [...keep, door("scan-L00-wall-4", "scan-L00-level", [125, 2065, 0]), door("scan-L01-wall-3", "scan-L01-level", [125, 2044, 3000]), seenOnce] };
    const deps = sdeps({ trustedJob: vi.fn(async () => ({ ...TRUSTED, result })) });
    const r = await propose(deps);
    expect(r.changesets.map((c) => c.name)).toEqual(["Survey job-0002 · GR-FFL"]);
    const gapHost = (w) => `its host wall ${w} is a type gap — propose the job again once the wall's group in the Holding Area closes`;
    expect([...deps.saved.values()][0].exceptions).toContainEqual(expect.objectContaining({ name: "door scan-L00-wall-4-door-1", reason: gapHost("scan-L00-wall-4") }));
    const planner = deps.audit.mock.calls.at(-1)[6];
    expect(planner.storeys.map((s) => s.held)).toEqual([undefined, [{ name: "door scan-L01-wall-3-door-1", reason: gapHost("scan-L01-wall-3") }]]);
    expect(r.storeys).toEqual(planner.storeys);
    // MA-5a-2: a door seen on one face is not proposed, not held — the planner's row lists it
    expect(planner.storeys.map((s) => s.doors_seen_once)).toEqual([["scan-L00-wall-2-door-9"], undefined]);
  });
});

describe("proposeFromJob (MA-5a-4): a lead aligns a drawing job by two points — one changeset per drawing, every ghost inferred, never pre-ticked", () => {
  const RESULT = readRepo("WebApp/bridge/fixtures/drawing/drill-plan-L00-result.json");
  const FX = readRepo("WebApp/bridge/fixtures/changeset-ops/contract2-drawing.json").stored;
  const EV7 = "d7".repeat(32);
  const TRUSTED = { job: { id: "job-0005", status: "done" }, result: RESULT,
    row: { ledger: { id: 3001, hash: "31".repeat(32) }, reader: "sentinel-drawing", version: "0.1.0", pack_id: "evp-0001", items: [{ id: "ev-0007", sha256: EV7 }],
      read: ["ev-0007"], result_sha256: "5e".repeat(32) } };
  const STD = { guideline: readRepo("demo/bds-pilot/bds-dd-layerfree-guideline.json"), type_catalog: readRepo("demo/bds-pilot/bds-type-catalog.json") };
  const resolving = (have) => vi.fn(async (key, kind) => (have[kind] ? installed(kind, have[kind]) : NONE));
  const BODY = { points: FX.job.alignment.points, check: FX.job.alignment.check, elevation_mm: 0 };
  const ddeps = (over = {}) => { let n = 3100; return baseDeps({
    myRole: vi.fn(async () => "lead"), requireMinRole: vi.fn(async () => "lead"), takeWriteBudget: vi.fn(), resolveArtefact: resolving(STD),
    trustedJob: vi.fn(async () => TRUSTED), readPack: vi.fn(async () => ({ pack: { items: [{ id: "ev-0007", sha256: EV7, state: "admitted" }] } })),
    manifestLevels: vi.fn(async () => []), audit: vi.fn(async () => ({ id: ++n, hash: "ab".repeat(32) })), ...over }); };
  const propose = (deps, body = BODY) => proposeFromJob("ma4c-drill", "job-0005", body, "web", deps);

  it("(a) the drill plan: one changeset (a created level, four walls typed), every ghost inferred and unticked; the alignment on the changeset and the planner's row", async () => {
    const deps = ddeps();
    const r = await propose(deps);
    expect(r.changesets.map((c) => [c.name, c.elements, c.preticked])).toEqual([["Drawing job-0005 · ev-0007 · Drawing ev-0007 job-0005", 5, 0]]);
    expect(r).toMatchObject({ job: "job-0005", drawing_row: { id: 3001 }, alignment: { ...FX.job.alignment, confirmed_by: "web" }, gaps: { groups: 3, elements: 3 }, already_filed: 0 });
    expect([r.frame, r.survey_row]).toEqual([undefined, undefined]);
    const cs = [...deps.saved.values()][0];
    expect(cs).toMatchObject(FX); // Trust.cs reads the same
    expect([cs.job.frame, cs.job.alignment.confirmed_by]).toEqual([undefined, "web"]);
    expect(cs.elements.every((e) => e.pretick === false && e.accuracy.status === "inferred" && e.place.TopElevation === undefined)).toBe(true);
    expect(deps.audit.mock.calls.map((c) => [c[1], c[3]])).toEqual([["changeset", "changeset_proposed"],
      ["type_gap", "type_gap:run job-0005 · drawing-planner · 3 group(s), 3 element(s)"], ["build", "build:run job-0005 · drawing-planner 0.2.0 · proposed"]]);
    expect(deps.audit.mock.calls[1][6]).toMatchObject({ claimed: false, source: "sentinel-drawing", job: { id: "job-0005", ledger_id: 3001 } });
    expect(deps.audit.mock.calls[2][6]).toMatchObject({ job_id: "job-0005", planner: "drawing-planner", version: "0.2.0", drawing_row: { id: 3001 }, alignment: { scale: 50, check_mm: 0 },
      claimed: false, model_calls: 0, tokens: 0, storeys: [{ level: "Drawing ev-0007 job-0005", how: "created" }] });
  });
  it("(b) refused before anything is written, each in words: the body, a wrong check point, another alignment of the same drawing, nothing new", async () => {
    const quiet = async (over, message, status = 409, body = BODY) => {
      const deps = ddeps(over);
      await expect(propose(deps, body)).rejects.toMatchObject({ status, message });
      expect([deps.docInsert.mock.calls.length, deps.audit.mock.calls.length, deps.adjudicateProposal.mock.calls.length]).toEqual([0, 0, 0]);
    };
    await quiet({}, "frame is not a proposal field — a drawing is proposed with {item?, points, check?, level?, elevation_mm, revises?}; the bridge builds every changeset from the job's own result — nothing was saved", 400, { frame: { dx_mm: 0 } });
    await quiet({}, "the check point lands 150 mm from where you said it is — more than the 100 mm an alignment is trusted to; one of the three points is not where it was read — nothing was saved", 400,
      { ...BODY, check: { paper: [220, 40], model: [48000, 150] } });
    const d0 = ddeps(); await propose(d0); const docs = [...d0.saved.values()];
    await quiet({ docList: vi.fn(async () => docs) }, "Drawing job-0005 · ev-0007 · Drawing ev-0007 job-0005 (proposed) was filed from job-0005 with ev-0007 aligned at 1:50, turned 0°, moved 37000, -2000 mm, at 0 mm (points [60,40] → [40000,0], [220,160] → [48000,6000]) — send those points and that elevation (one drawing is one alignment), or read the drawing again to propose it afresh; nothing was saved",
      409, { ...BODY, elevation_mm: 3000 });
    await quiet({ docList: vi.fn(async () => docs) }, "nothing new to propose from job-0005 — every candidate that types is filed already (Drawing job-0005 · ev-0007 · Drawing ev-0007 job-0005: proposed): decline a proposed one in Revit (Review AI Proposals → Decline all, with a reason) to propose it again; an applied one stays applied here after an Undo in Revit — read the drawing again to propose it afresh; nothing was saved");
  });
  it("(d) review: the same points proposed again read back from jsonb (keys reordered) are the same alignment — 'nothing new', never 'another alignment'", async () => {
    const jsonb = (v) => JSON.parse(JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))) : x)));
    const d0 = ddeps(); await propose(d0);
    const back = jsonb([...d0.saved.values()]);
    expect(Object.keys(back[0].job.alignment.points[0])).toEqual(["model", "paper"]);
    const deps = ddeps({ docList: vi.fn(async () => back) });
    await expect(propose(deps)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/^nothing new to propose from job-0005 — every candidate that types is filed already \(Drawing job-0005 · ev-0007 · Drawing ev-0007 job-0005: proposed\)/) });
  });
  it("(e) review: a job that read two drawings — the second, all type gaps, files its gaps after the first is filed; another drawing changed does not stop it", async () => {
    const W3 = RESULT.candidates.find((c) => c.cid === "drawing-ev-0007-p1-wall-3"); // 250 mm: a type gap on these standards
    const two = { ...TRUSTED, result: { ...RESULT, candidates: [...RESULT.candidates, { ...W3, cid: "drawing-ev-0008-p1-wall-1", evidence: ["ev-0008#page-1"] }] },
      row: { ...TRUSTED.row, items: [...TRUSTED.row.items, { id: "ev-0008", sha256: "d8".repeat(32) }], read: ["ev-0007", "ev-0008"] } };
    const d0 = ddeps({ trustedJob: vi.fn(async () => two) }); await propose(d0, { ...BODY, item: "ev-0007" });
    const deps = ddeps({ trustedJob: vi.fn(async () => two), docList: vi.fn(async () => [...d0.saved.values()]),
      readPack: vi.fn(async () => ({ pack: { items: [{ id: "ev-0007", sha256: EV7, state: "changed" }, { id: "ev-0008", sha256: "d8".repeat(32), state: "admitted" }] } })) });
    const r = await propose(deps, { ...BODY, item: "ev-0008" });
    expect([r.changesets, r.gaps.groups, r.gaps.elements]).toEqual([[], 1, 1]);
    expect(deps.audit.mock.calls.map((c) => c[1])).toEqual(["type_gap", "build"]);
  });
  it("(f) MA-5a-5: on a project whose scan is filed on that storey — what agrees is not proposed, the partition raises ONE topic, a re-run raises none", async () => {
    const sw = (cid, start, end, t) => ({ op: "create", kind: "wall", cid, proposal_guid: `g-${cid}`, place: { LevelName: "GR-FFL", LocationCurve: { start, end } }, measured: { thickness_mm: t } });
    const SCAN = { id: "s1", name: "Survey job-0002 · GR-FFL", status: "applied", result: { rejected: [] },
      job: { id: "job-0002", ledger_id: 2201, reader: "sentinel-survey 0.1.0", storey: { cid: "scan-L00-level", level: "GR-FFL", how: "matched", elevation_mm: 0, delta_mm: 0, checked: true, from: "ARC.ifc P01" } },
      elements: [sw("scan-L00-wall-1", [40125, 150, 0], [47850, 150, 0], 300), sw("scan-L00-wall-2", [40125, 5900, 0], [47850, 5900, 0], 200), sw("scan-L00-wall-3", [47850, 150, 0], [47850, 5900, 0], 300)] };
    const topics = [], W1 = "drawing-ev-0007-p1-wall-1";
    const topicDeps = { bcfListTopics: vi.fn(async () => topics), bcfCreateTopic: vi.fn(async (t) => { topics.push(t); return t; }), broadcast: vi.fn() };
    const deps = ddeps({ docList: vi.fn(async () => [SCAN]), ...topicDeps });
    const r = await propose(deps);
    expect(r.changesets.map((c) => [c.name, c.elements, c.preticked])).toEqual([["Drawing job-0005 · ev-0007 · GR-FFL", 1, 0]]); // the partition alone, on the scan's level
    const key = `${EV7}|${W1}|-|-|drawn_only`;
    expect(r.differences).toEqual({ agree: 3, differ: 0, drawn_only: 1, scanned_only: 0, doors_agree: 0, doors_from_drawing: 0,
      topics: { raised: [{ guid: topics[0].guid, title: `Drawing vs scan: ev-0007 ${W1} — drawn, not in the scan`, key }], skipped: 0 } });
    expect(topics[0]).toMatchObject({ project_id: "ma4c-drill", topic_type: "Issue", topic_status: "Open",
      difference: { kind: "drawn_only", key, item: "ev-0007", drawing_cid: W1, scan_cid: null, drawing_job: "job-0005" } });
    expect(topicDeps.broadcast).toHaveBeenCalledWith("ma4c-drill", { type: "topic", action: "created", guid: topics[0].guid, title: topics[0].title });
    expect(deps.audit.mock.calls.at(-1)[6]).toMatchObject({ planner: "drawing-planner", differences: r.differences });
    // withdrawn on the desk and proposed again: the partition is proposed again, its difference is not raised twice
    const again = ddeps({ docList: vi.fn(async () => [SCAN, { ...[...deps.saved.values()][0], status: "withdrawn" }]), ...topicDeps });
    expect((await propose(again)).differences.topics).toEqual({ raised: [], skipped: 1 });
    expect(topics).toHaveLength(1);
    // the topics not read: said in words, the changeset filed all the same
    const down = ddeps({ docList: vi.fn(async () => [SCAN]), ...topicDeps, bcfListTopics: vi.fn(async () => { throw new Error("the topic store is down"); }) });
    const r3 = await propose(down);
    expect([r3.changesets.length, r3.differences.topics]).toEqual([1, { raised: [], skipped: 0, error: "the project's topics could not be read (the topic store is down) — none raised; propose the drawing again to raise them" }]);
    // review: proposed again as the words say — nothing new to file, but its topic not raised yet is raised; then a third time is 'nothing new'
    const fresh = [], up = { bcfListTopics: vi.fn(async () => fresh), bcfCreateTopic: vi.fn(async (t) => { fresh.push(t); return t; }), broadcast: vi.fn() };
    const retry = ddeps({ docList: vi.fn(async () => [SCAN, ...down.saved.values()]), ...up });
    const r4 = await propose(retry);
    expect([r4.changesets, r4.differences.topics.raised.map((t) => t.key), fresh.length]).toEqual([[], [key], 1]);
    await expect(propose(ddeps({ docList: vi.fn(async () => [SCAN, ...down.saved.values()]), ...up }))).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/^nothing new to propose from job-0005/) });
  });
  it("(g) MA-5b-1: the plan with room labels — a room at its label's point, named and numbered, inferred and unticked; one round a type gap is held", async () => {
    const ROOMS = readRepo("WebApp/bridge/fixtures/drawing/drill-plan-L00-rooms-result.json");
    const deps = ddeps({ trustedJob: vi.fn(async () => ({ ...TRUSTED, result: ROOMS })) });
    const r = await propose(deps);
    expect(r.changesets.map((c) => [c.name, c.elements, c.preticked])).toEqual([["Drawing job-0005 · ev-0007 · Drawing ev-0007 job-0005", 6, 0]]);
    const cs = [...deps.saved.values()][0], [room] = cs.elements.filter((e) => e.kind === "room");
    expect(room).toMatchObject({ op: "create", cid: "drawing-ev-0007-p1-room-1", pretick: false, accuracy: { status: "inferred", basis: "drawing", from_job: "job-0005", scale: 50 },
      validate: { identity: { Class: "IFCSPACE", Name: "102", LongName: "MEETING ROOM" } },
      place: { LevelName: "Drawing ev-0007 job-0005", Name: "MEETING ROOM", Number: "102" }, measured: { text_height_paper_mm: expect.any(Number) } });
    // its label's point, in the east room's inner faces (x 4100..7700, y 300..5800 from the drawing's (0, 0) at 40000, 0)
    const [x, y, z] = room.place.Location;
    expect([x > 44100 && x < 47700, y > 300 && y < 5800, z]).toEqual([true, true, 0]);
    expect(room.reason).toMatch(/^drawn room 102 MEETING ROOM on ev-0007 page 1 at 1:50, inside drawing-ev-0007-p1-wall-1, drawing-ev-0007-p1-wall-4, drawing-ev-0007-p1-wall-5, drawing-ev-0007-p1-wall-2 · Revit finds its boundary at this point; Apply refuses it if the walls there do not close · drawn, not measured/);
    // OFFICE: its west wall (250 mm) is a type gap in this catalogue — held, said why
    expect(cs.exceptions).toContainEqual({ unique_id: "drawing-ev-0007-p1-room-2", name: "room drawing-ev-0007-p1-room-2",
      reason: "bounded by drawing-ev-0007-p1-wall-3, a type gap — propose the drawing again once the wall's group in the Holding Area closes" });
    // proposed again: the room is filed — nothing new
    await expect(propose(ddeps({ trustedJob: vi.fn(async () => ({ ...TRUSTED, result: ROOMS })), docList: vi.fn(async () => [...deps.saved.values()]) })))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/^nothing new to propose from job-0005/) });
  });
  it("(h) MA-5b-3: revision B of a placed drawing — the same walls and room left as placed, the moved partition proposed anew, A's partition a person's row", async () => {
    const ROOMS = readRepo("WebApp/bridge/fixtures/drawing/drill-plan-L00-rooms-result.json"), REVB = readRepo("WebApp/bridge/fixtures/drawing/drill-plan-L00-rev-b-result.json");
    const a = ddeps({ trustedJob: vi.fn(async () => ({ ...TRUSTED, result: ROOMS })) });
    await propose(a);
    const A = [...a.saved.values()][0];
    const placed = { ...A, status: "applied", result: { rejected: [], applied: A.elements.map((e, k) => ({ proposal_guid: e.proposal_guid, revit_unique_id: `uid-${k}` })) } };
    const EV8 = "e8".repeat(32);
    const TB = { job: { id: "job-0006", status: "done" }, result: REVB, row: { ledger: { id: 3002, hash: "32".repeat(32) }, reader: "sentinel-drawing", version: "0.2.0",
      pack_id: "evp-0001", items: [{ id: "ev-0008", sha256: EV8 }], read: ["ev-0008"], result_sha256: "6e".repeat(32) } };
    const bdeps = (over = {}) => ddeps({ trustedJob: vi.fn(async () => TB), readPack: vi.fn(async () => ({ pack: { items: [{ id: "ev-0008", sha256: EV8, state: "admitted" }] } })),
      docList: vi.fn(async () => [placed]), ...over });
    const proposeB = (deps, body = { ...BODY, revises: "ev-0007" }) => proposeFromJob("ma4c-drill", "job-0006", body, "web", deps);
    const b = bdeps(), r = await proposeB(b);
    expect(r.revision).toEqual({ revises: "ev-0007", unchanged: 3, reshaped: 0, changed: 0, removed: 1, doors_unchanged: 0, doors_removed: 0, rooms_unchanged: 1, rooms_removed: 0 });
    expect(r.changesets.map((c) => [c.name, c.elements])).toEqual([["Drawing job-0006 · ev-0008 · Drawing ev-0007 job-0005", 1]]); // on A's level: no level created
    const cs = [...b.saved.values()][0];
    expect(cs.elements.map((e) => [e.kind, e.cid, e.place.LevelName])).toEqual([["wall", "drawing-ev-0008-p1-wall-1", "Drawing ev-0007 job-0005"]]);
    expect(cs.job).toMatchObject({ alignment: { revises: "ev-0007" }, storey: { level: "Drawing ev-0007 job-0005", how: "revision" } });
    const aPart = "drawing-ev-0007-p1-wall-1"; // A's partition, x 44050
    expect(cs.exceptions).toContainEqual({ unique_id: aPart, name: `wall ${aPart}`,
      reason: "on ev-0007, not on ev-0008 — placed from Drawing job-0005 · ev-0007 · Drawing ev-0007 job-0005 (Revit uid-1): Sentinel never deletes; a person removes it in Revit, or keeps it" });
    expect(b.audit.mock.calls.at(-1)[6]).toMatchObject({ revision: r.revision });
    // refused in words: a drawing that filed nothing; another storey than A's
    await expect(proposeB(bdeps({ docList: vi.fn(async () => []) }))).rejects.toMatchObject({ status: 409,
      message: "ev-0007 filed nothing on ma4c-drill — propose it first (what it filed is what ev-0008 is compared with); if it was proposed and filed nothing new, name the drawing it revised itself; or leave revises out; nothing was saved" });
    // review: B proposed again WITHOUT revises would propose A's walls on top of A's — one drawing is one alignment, revises included
    await expect(proposeB(bdeps({ docList: vi.fn(async () => [placed, ...b.saved.values()]) }), BODY)).rejects.toMatchObject({ status: 409,
      message: expect.stringMatching(/^Drawing job-0006 · ev-0008 · Drawing ev-0007 job-0005 \(proposed\) was filed from job-0006 with ev-0008 aligned at .* — send those points and that elevation, revising ev-0007 \(one drawing is one alignment\)/) });
    // review: A still proposed (from another job) — the 409 says apply it first, never "withdraw" (which loops into "filed nothing")
    await expect(proposeB(bdeps({ docList: vi.fn(async () => [A]) }))).rejects.toMatchObject({ status: 409,
      message: "Drawing job-0005 · ev-0007 · Drawing ev-0007 job-0005 (from job-0005) — the drawing ev-0008 revises — is still proposed: apply it in Revit first (a revision is compared with what it placed); nothing was saved" });
    await expect(proposeB(bdeps(), { ...BODY, revises: "ev-0007", elevation_mm: 3000 })).rejects.toMatchObject({ status: 400,
      message: "ev-0007 was filed on Drawing ev-0007 job-0005 at 0 mm, and elevation_mm says 3000 — a revision is the same storey: state 0 — nothing was saved" });
  });
  it("(c) a drawing changeset has no scan: measuring it and showing its scan are refused in words", async () => {
    const deps = ddeps(); await propose(deps);
    const cs = { ...[...deps.saved.values()][0], status: "applied" };
    deps.saved.set(cs.id, cs);
    await expect(verifyChangeset("ma4c-drill", { changeset: cs.id }, "web", { ...deps, myRole: vi.fn(async () => "contributor"), requireMinRole: vi.fn(async () => "contributor") }))
      .rejects.toMatchObject({ status: 409, message: "Drawing job-0005 · ev-0007 · Drawing ev-0007 job-0005 was built from a drawing (job-0005) — what someone drew, not what was built: there is no scan to measure it against — nothing was saved" });
    await expect(scanOverlay("ma4c-drill", cs.id, { ...deps, myRole: vi.fn(async () => "contributor"), requireMinRole: vi.fn(async () => "contributor") }))
      .rejects.toMatchObject({ status: 409, message: "Drawing job-0005 · ev-0007 · Drawing ev-0007 job-0005 was built from a drawing (job-0005) — it has no scan to show" });
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
  // MA-5a-2: each face's own numbers beside the pooled ones (the per-face verdict); shares at the bridge's tolerances, 20 mm the verdict's
  const SW = { 20: 1, 50: 1, 100: 1, 200: 1 }, FACE = (points, s20 = 1) => ({ points, coverage: 0.999, share_within: { ...SW, 20: s20 } });
  const NUMS = (o = {}) => ({ points: 3512, p95_mm: 3, mean_signed_mm: 0, share_within: SW, coverage: 0.999, faces: [FACE(1756), FACE(1756)], ...o });
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
      params: { voxel_mm: 20, storey_min_mm: 2000, tolerances_mm: [20, 50, 100, 200] }, seed: 1, elements: [
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
      evidence: [{ id: "ev-0001", sha256: EV }], reader: "sentinel-survey", version: "0.1.0", params: ROW.params, seed: 1, tolerances_mm: [20, 50, 100, 200], deviation: { within_mm: 20, face_share_min: 0.2, per: "face" }, min_coverage: 0.25,
      measure: KNOBS, reference: "as filed", frame: CS.job.frame, storey: { level: "GR-FFL", how: "named", checked: false, delta_mm: null }, sign: "+ = the scan outside the element's face",
      points_in: 47699, points_used: 47672, counts: { within_tolerance: 3, out_of_tolerance: 0, missing: 0, insufficient_data: 0, not_measured: 0 }, model_calls: 0, tokens: 0, claimed: false });
    expect(v.elements[0]).toEqual({ proposal_guid: "g1", revit_unique_id: "u1", cid: "scan-L00-wall-1", kind: "wall", reference: "as filed", status: "within_tolerance", basis: "deviation", ...NUMS(),
      reason: "this check misses most 20 mm offsets, and a thin partition moved by its own thickness can pass" }); // MA-5a-2 (review): a pass carries the check's limits
    expect(v.target_mm).toBeUndefined(); // MA-5a-2: the verdict is the per-face share, named in deviation
    expect(r).toEqual({ changeset: { id: ID, name: "Survey job-0002 · GR-FFL" }, status: "done", reference: "as filed", counts: v.counts, elements: v.elements, ledger: { id: 2300, hash: "ab".repeat(32) } });
    expect([deps.docInsert.mock.calls.length, deps.docReplaceIfField.mock.calls.length]).toEqual([0, 0]);
  });
  it("(b) the bridge's verdicts: out of tolerance, missing, and an element undone in Revit not measured — counted on the row", async () => {
    const deps = vdeps({ listAudit: audits([{ id: 2215, action: "changeset_reverted", new_value: { op: "undo", guids: ["g3"] } }, ...ROWS]),
      measureJob: DONE((i) => (i ? { points: 0, p95_mm: null, mean_signed_mm: null, share_within: null, coverage: 0, faces: [{ points: 0, coverage: 0, share_within: null }, { points: 0, coverage: 0, share_within: null }] }
        : { p95_mm: 63, share_within: { 20: 0, 50: 0, 100: 1, 200: 1 }, faces: [FACE(1756, 0), FACE(1756, 0)] })) });
    const r = await verify(deps);
    expect(deps.measureJob.mock.calls[0][2].elements.map((e) => e.guid)).toEqual(["g1", "g2"]);
    expect(r.elements.map((e) => [e.status, e.reason ?? null])).toEqual([["out_of_tolerance", "face 1: 0% of its points within 20 mm; face 2: 0% of its points within 20 mm — each face needs 20% (this check misses most 20 mm offsets, and a thin partition moved by its own thickness can pass)"],
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
    await quiet({}, "results is not a measure field — the bridge measures what Revit placed, by Revit's re-read where it sent one, else as filed, against its job's own scan; send {changeset} — nothing was saved", 400, { changeset: ID, results: [] });
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
      result: { elements: p.elements.map((e) => ({ guid: e.guid, ...NUMS({ share_within: { 20: 1, 50: 1, 75: 0.5, 100: 1, 200: 1 } }) })), derived: [],
        receipt: { started: 7, finished: "x".repeat(41), cpu_s: "fast", points_in: 47699, points_used: null, measure: KNOBS, note: "kept nowhere" } } }));
    let deps = vdeps({ measureJob: odd });
    await verify(deps);
    let v = deps.audit.mock.calls[0][6];
    expect([v.status, v.started, v.finished, v.cpu_s, v.points_in, v.points_used, v.measure]).toEqual(["done", null, null, null, 47699, null, KNOBS]);
    expect(v.elements[0].share_within).toEqual({ 20: 1, 50: 1, 100: 1, 200: 1 }); // the 75 mm share the service sent is not the bridge's tolerance
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
  const CLOUD = () => vi.fn(async () => ({ status: "done", version: "0.1.0", refused: [], result: { points: [[125, 150, 1400], [7850, 5900, 2500]], derived: [],
    receipt: { cloud: { cell_mm: 100, z_mm: [300, 2500], of: 2, points: 2 } } } }));
  // The scan as MA-4a stores it: every USES key set (evidence-logic :266-268), viewing allowed. vdeps' SCAN (MA-4e) names geometry_extraction only.
  const SEEN = { ...SCAN, allowed_uses: { view_reference: true, geometry_extraction: true, texture_embed: false, redistribute: false, ml_training: false } };
  const sdeps = (over = {}, cs = CS) => vdeps({ readPack: vi.fn(async () => ({ pack: { items: [SEEN] }, folder: { path: DIR } })), measureJob: CLOUD(), ...over }, cs);
  it("(h) MA-4f: the scan around a survey changeset's storey for Revit's overlay — a signed-in contributor; the job's own cloud on the survey slot, the walls' height less 300 mm, in the model's frame; no row, no write", async () => {
    const deps = sdeps();
    const r = await scanOverlay("ma4c-drill", ID, deps);
    expect(deps.requireMinRole).toHaveBeenCalledWith("ma4c-drill", "contributor");
    expect(deps.measureJob.mock.calls[0]).toEqual(["ma4c-drill", "job-0002", { job_id: `scan-${ID}`, items: [{ id: "ev-0001", kind: "scan", path: resolve(DIR, "scans/two-storey.las"), sha256: EV }],
      params: { voxel_mm: 20, storey_min_mm: 2000 }, seed: 1, cloud: { cell_mm: 100, z_mm: [300, 2500], max_points: 5000 } }, {}, { path: "/cloud", what: "a scan overlay" }]);
    expect(r).toEqual(readRepo("WebApp/bridge/fixtures/changeset-ops/scan-reply.json"));
    expect([deps.audit.mock.calls.length, deps.docInsert.mock.calls.length, deps.docReplaceIfField.mock.calls.length, deps.takeWriteBudget.mock.calls[0]])
      .toEqual([0, 0, 0, ["survey jobs", { perUser: 6, all: 12 }]]);
    // MA-4f: a frame raised and turned — the band goes to the service in the scan's frame (toScan: less dz), the points come back through
    // toModel (turned 90° anticlockwise, then moved), whole mm; the answer's band stays the model's.
    const turned = sdeps({}, { ...CS, job: { ...CS.job, frame: { dx_mm: 40000, dy_mm: 0, dz_mm: 1000, rotation_deg: 90 } } });
    const t = await scanOverlay("ma4c-drill", ID, turned);
    expect([turned.measureJob.mock.calls[0][2].cloud.z_mm, t.z_mm, t.points]).toEqual([[-700, 1500], [300, 2500], [[39850, 125, 2400], [34100, 7850, 3500]]]);
  });
  it("(i) MA-4f: the overlay's refusals say what is not shown — the machine credential, a viewer, not a survey changeset, no wall, the job's chain, viewing not allowed (fails closed), the scan not read again, the slot busy, an answer not the contract's", async () => {
    const no = async (over, cs, status, message) => { const deps = sdeps(over, cs); await expect(scanOverlay("ma4c-drill", ID, deps)).rejects.toMatchObject({ status, message }); return deps; };
    const machine = await no({ myRole: vi.fn(async () => "service") }, CS, 403,
      "showing a changeset's scan needs a person — it reads the whole scan on this PC's one survey slot: sign in (in Revit: Standards ▸ Sign in) — its scan is not shown");
    expect([machine.measureJob.mock.calls.length, machine.takeWriteBudget.mock.calls.length]).toEqual([0, 0]);
    await no({ requireMinRole: vi.fn(async () => { throw Object.assign(new Error("this action requires the contributor role (you are viewer)"), { status: 403 }); }) }, CS, 403,
      "this action requires the contributor role (you are viewer) — showing a survey changeset's scan runs sentinel-survey: a contributor's — its scan is not shown");
    await no({}, { ...CS, job: null, claimed: true }, 409, "Survey job-0002 · GR-FFL was not built from a survey job — it has no scan to show");
    await no({}, { ...CS, elements: [] }, 409, "Survey job-0002 · GR-FFL has no wall to show the scan against");
    await no({ readPack: vi.fn(async () => ({ pack: { items: [{ ...SEEN, state: "changed" }] }, folder: { path: DIR } })) }, CS, 409,
      "ev-0001 is not the bytes job-0002 read (Re-check flagged it changed) — survey the admitted scan again — its scan is not shown");
    for (const uses of [{ ...SEEN.allowed_uses, view_reference: false }, { geometry_extraction: true }]) // false, and absent: fails closed, like pickItems
      await no({ readPack: vi.fn(async () => ({ pack: { items: [{ ...SEEN, allowed_uses: uses }] }, folder: { path: DIR } })) }, CS, 409,
        "ev-0001's allowed uses do not include viewing it as a reference — its scan is not shown");
    // The budget's 429 says "nothing was saved" mid-sentence: dropped there too (a view saves nothing).
    await no({ takeWriteBudget: vi.fn(() => { throw Object.assign(new Error("too many survey jobs in a minute — nothing was saved; try again shortly"), { status: 429 }); }) }, CS, 429,
      "too many survey jobs in a minute; try again shortly — its scan is not shown");
    await no({ measureJob: vi.fn(async () => ({ status: "refused", refused: [{ id: "ev-0001", reason: "changed since admitted (its sha256 is not the pack's) — Re-check flags it" }] })) }, CS, 409,
      "the scan of Survey job-0002 · GR-FFL was not read again — ev-0001: changed since admitted (its sha256 is not the pack's) — Re-check flags it — its scan is not shown");
    await no({ measureJob: vi.fn(async () => { throw Object.assign(new Error("a survey job is already running on this bridge (one at a time) — try again when it ends; nothing was saved"), { status: 409 }); }) }, CS, 409,
      "a survey job is already running on this bridge (one at a time) — try again when it ends — its scan is not shown");
    await no({ measureJob: vi.fn(async () => ({ status: "done", result: { points: [[1.5, 0, 0]], receipt: { cloud: { cell_mm: 100, of: 1 } } } })) }, CS, 502,
      "sentinel-survey's scan overlay is not the contract's shape (a point is not three whole numbers of mm) — its scan is not shown");
  });
  it("(j) MA-8-9: a stair flag's scan slice - the flag's own band (no margin) and plan box go to the service, the points outside the exact box are dropped; an unknown flag is a 404; an IFC changeset says there is no slice", async () => {
    const flag = { unique_id: "stair:pick-0a1b2c3d", name: "Stair picked on L01", reason: "r", kind: "stair", storey: "L01", source: "pick", box: { min: [40000, 0, 1000], max: [41000, 1000, 2000] } };   // CS: the scan moved 40 m in x
    const deps = sdeps({}, { ...CS, exceptions: [flag] });
    const r = await scanOverlay("ma4c-drill", ID, deps, { flag: flag.unique_id });
    expect(deps.measureJob.mock.calls[0][2].cloud).toEqual({ cell_mm: 100, z_mm: [1000, 2000], max_points: 5000, xy_mm: [[0, 0], [1000, 1000]] });
    expect([r.flag, r.z_mm, r.points]).toEqual([flag.unique_id, [1000, 2000], [[40125, 150, 1400]]]);   // the second point is outside the box
    const wallless = sdeps({}, { ...CS, elements: [], exceptions: [flag] });   // the 'no wall' 409 is skipped when a flag is given
    expect((await scanOverlay("ma4c-drill", ID, wallless, { flag: flag.unique_id })).points).toHaveLength(1);
    const turned = sdeps({}, { ...CS, exceptions: [flag], job: { ...CS.job, frame: { dx_mm: 40000, dy_mm: 0, dz_mm: 1000, rotation_deg: 90 } } });
    await scanOverlay("ma4c-drill", ID, turned, { flag: flag.unique_id });
    expect(turned.measureJob.mock.calls[0][2].cloud).toMatchObject({ z_mm: [0, 1000] });
    expect(turned.measureJob.mock.calls[0][2].cloud.xy_mm).toHaveLength(2);
    // review: a frame turned a multiple of 90 degrees crops the exact box, so `of` is the survey's; any other turn crops a larger square - `of` is null and the crop said
    expect([r.of, r.crop]).toEqual([2, undefined]);
    const t45 = await scanOverlay("ma4c-drill", ID, sdeps({}, { ...CS, exceptions: [flag], job: { ...CS.job, frame: { dx_mm: 40000, dy_mm: 0, dz_mm: 1000, rotation_deg: 45 } } }), { flag: flag.unique_id });
    expect([t45.of, t45.crop]).toEqual([null, "axis-aligned square of a turned frame"]);
    const without = sdeps({}, { ...CS, exceptions: [flag] });   // no flag asked: the request is as before (no xy_mm)
    await scanOverlay("ma4c-drill", ID, without);
    expect(without.measureJob.mock.calls[0][2].cloud).toEqual({ cell_mm: 100, z_mm: [300, 2500], max_points: 5000 });
    await expect(scanOverlay("ma4c-drill", ID, sdeps({}, { ...CS, exceptions: [flag] }), { flag: "stair:nope" })).rejects.toMatchObject({ status: 404, message: `${CS.name} has no stair flag "stair:nope" — its scan slice is not shown` });
    await expect(scanOverlay("ma4c-drill", ID, sdeps({}, { ...CS, exceptions: [flag], job: { ...CS.job, reader: "sentinel-ifc 0.2.0" } }), { flag: flag.unique_id }))
      .rejects.toMatchObject({ status: 409, message: `${CS.name} was built from an IFC (${CS.job.id}) — it has no scan to show — a stair flag on it has no scan slice: flag the stair on a survey changeset of this storey` });
  });
});

describe("MA-6-2 — Revit's as-built re-read, judged by the bridge against the installed ids@n (fixture as-built-result.json)", () => {
  const FX = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/as-built-result.json", import.meta.url), "utf8"));
  const resolving = (have) => vi.fn(async (key, kind) => (have[kind] ? installed(kind, have[kind]) : NONE));
  const LABEL = `ids@1 · office · ${"ab".repeat(6)}…`;
  // The fixture's body proposed, then every element reported applied as Revit sends it (applied[i].element → that element's proposal_guid).
  const report = async ({ over = {}, ids = FX.ids, edit = (a) => a } = {}) => {
    const deps = baseDeps({ myRole: async () => "contributor", resolveArtefact: resolving(ids ? { ids } : {}), audit: vi.fn(async () => ({ id: 2201, hash: "ef".repeat(32) })), ...over });
    const cs = await proposeChangeset("ma4c-drill", FX.body, "agent", deps);
    const applied = FX.applied.map(({ element, ...a }) => edit({ ...structuredClone(a), proposal_guid: cs.elements[element].proposal_guid }, element));
    const out = await reportResult("ma4c-drill", cs.id, { applied, rejected: [] }, "lead@office.example", deps);
    return { out, deps, g: cs.elements.map((e) => e.proposal_guid), row: deps.audit.mock.calls.find((c) => c[3] === "changeset_applied")[6] };
  };

  it("judges each element as built under its proposal_guid: a wall with its FireRating passes, one without fails, the door is not in scope, the level is counted out of scope; the row carries the counts", async () => {
    const { out, g, row, deps } = await report();
    expect(out.result.as_built).toEqual({ ids: LABEL, ids_sha256: "ab".repeat(32), reported_role: "contributor", judged: 2, passed: 1, failed: 1, not_read: 0, not_judged: 0, out_of_scope: { level: 1 },
      elements: [
        { proposal_guid: g[1], class_claimed: "IFCWALL", class_as_built: "IFCWALL", global_id_as_built: "2Hq$9xV1n0Fh8b3XkQd0aB", verdict: "passes" },
        { proposal_guid: g[2], class_claimed: "IFCWALL", class_as_built: "IFCWALL", global_id_as_built: "5a1c2b3d-1111-2222-3333-444455556666-00061f33", verdict: "fails",
          failures: [{ specification: "Walls · fire", requirement: "Pset_WallCommon.FireRating", reason: "REQUIRED but missing" }] },
        { proposal_guid: g[3], class_claimed: "IFCDOOR", class_as_built: "IFCDOOR", global_id_as_built: "0j7Y3Kc4H9qBf2Lw5Pz1sD", verdict: "not in scope" },
      ] });
    expect(row.as_built).toEqual({ ids: LABEL, reported_role: "contributor", judged: 2, passed: 1, failed: 1, not_read: 0, not_judged: 0 });
    expect(deps.resolveArtefact.mock.calls.map((c) => c.slice(0, 2))).toEqual([["ma4c-drill", "ids"]]);
    // The applied entries keep what they kept before MA-6-2: the re-read values are not stored on the changeset (it is listed to every desk).
    expect(out.result.applied[1]).toEqual({ proposal_guid: g[1], revit_element_id: 401202, revit_unique_id: "5a1c2b3d-1111-2222-3333-444455556666-00061f32" });
  });

  it("is kept field by field: a posted verdict or an extra key changes nothing — the bridge judges what Revit read", async () => {
    const { out } = await report({ edit: (a, i) => (i === 2 ? { ...a, verdict: "passes", as_built: { ...a.as_built, verdict: "passes", passed: true,
      identity: { ...a.as_built.identity, Extra: "x", pretick: true }, psets: [{ ...a.as_built.psets[0], accepted: true }] } } : a) });
    const el = out.result.as_built.elements[1];
    expect(el.verdict).toBe("fails");
    expect(Object.keys(el)).toEqual(["proposal_guid", "class_claimed", "class_as_built", "global_id_as_built", "verdict", "failures"]);
    expect(JSON.stringify(out.result)).not.toMatch(/Extra|pretick|"accepted"|"passed":true/);
  });

  it("risk R4: a requirement outside Revit's readable keys is \"not read\", never a failure — and with no readable list a missing value fails", async () => {
    const spec = FX.ids.specifications[0];
    const ids = { ...FX.ids, specifications: [{ ...spec, requirements: { properties: [...spec.requirements.properties,
      { pset: "Pset_WallCommon", name: "LoadBearing", cardinality: "required" }], attributes: [] } }] };
    const { out, row } = await report({ ids });
    expect(out.result.as_built).toMatchObject({ judged: 2, passed: 0, failed: 1, not_read: 1 });
    const [rated, unrated] = out.result.as_built.elements;
    expect(rated).toMatchObject({ verdict: "not read", not_read: ["Pset_WallCommon.LoadBearing"] });
    expect(rated.failures).toBeUndefined();
    expect(unrated).toMatchObject({ verdict: "fails", not_read: ["Pset_WallCommon.LoadBearing"], failures: [{ requirement: "Pset_WallCommon.FireRating" }] });
    expect(row.as_built).toMatchObject({ judged: 2, passed: 0, failed: 1, not_read: 1 });
    const bare = await report({ ids, edit: (a) => { delete a.readable; return a; } });
    expect(bare.out.result.as_built).toMatchObject({ judged: 2, passed: 0, failed: 2, not_read: 0 });
    // The readable keys are compared as the IDS compares a pset and a property: case aside.
    const shout = await report({ ids, edit: (a) => (a.readable ? { ...a, readable: [...a.readable.map((k) => k.toUpperCase()), "PSET_WALLCOMMON.LOADBEARING"] } : a) });
    expect(shout.out.result.as_built).toMatchObject({ passed: 0, failed: 2, not_read: 0 });
    // MA-6-2 review: a prohibited requirement, or an optional one with a value, on a key Revit cannot read is never seen absent — "not read",
    // never "passes"; one Revit did send is judged (a wrong value fails); an optional one that asks nothing cannot fail and is not listed.
    const asks = (props) => ({ ...FX.ids, specifications: [{ ...spec, requirements: { properties: [...spec.requirements.properties, ...props], attributes: [] } }] });
    const banned = await report({ ids: asks([{ pset: "Pset_WallCommon", name: "LoadBearing", cardinality: "prohibited" },
      { pset: "Pset_WallCommon", name: "Combustible", cardinality: "optional", value: "FALSE" }, { pset: "Pset_WallCommon", name: "Status", cardinality: "optional" }]) });
    expect(banned.out.result.as_built).toMatchObject({ judged: 2, passed: 0, failed: 1, not_read: 1 });
    expect(banned.out.result.as_built.elements[0]).toMatchObject({ verdict: "not read", not_read: ["Pset_WallCommon.LoadBearing", "Pset_WallCommon.Combustible"] });
    const seen = await report({ ids: asks([{ pset: "Pset_WallCommon", name: "LoadBearing", cardinality: "prohibited" }]),
      edit: (a) => (a.as_built ? { ...a, as_built: { ...a.as_built, psets: [{ ...a.as_built.psets[0], rows: [...(a.as_built.psets[0]?.rows ?? []), { name: "LoadBearing", value: "TRUE" }] }] } } : a) });
    expect(seen.out.result.as_built.elements[0]).toMatchObject({ verdict: "fails", failures: [{ requirement: "Pset_WallCommon.LoadBearing", reason: 'must be ABSENT but is "TRUE"' }] });
    expect(seen.out.result.as_built.elements[0].not_read).toBeUndefined();
  });

  it("no IDS installed, one that does not parse, or a read that fails: the elements are listed with their class, unjudged, and why — the result is still recorded", async () => {
    const none = await report({ ids: null });
    const why = "no IDS judged it — not installed for ma4c-drill or its office";
    expect(none.out.status).toBe("applied");
    expect(none.out.result.as_built).toMatchObject({ ids: null, why, judged: 0, passed: 0, failed: 0, not_judged: 3, out_of_scope: { level: 1 } });
    expect(none.out.result.as_built.elements.map((e) => [e.class_as_built, e.verdict])).toEqual([["IFCWALL", undefined], ["IFCWALL", undefined], ["IFCDOOR", undefined]]);
    expect(none.row.as_built).toEqual({ ids: null, why, reported_role: "contributor", judged: 0, passed: 0, failed: 0, not_read: 0, not_judged: 3 });
    const empty = await report({ ids: { title: "no specs", specifications: [] } });
    expect(empty.out.result.as_built.why).toMatch(/^no IDS judged it — ids@1 · office · .* did not parse: an IDS artefact needs at least one specification/);
    const down = await report({ over: { resolveArtefact: vi.fn(async () => { throw new Error("bridge_docs timed out"); }) } });
    expect([down.out.status, down.out.result.as_built.why]).toEqual(["applied", "no IDS judged it — the ids@n was not read: bridge_docs timed out"]);
  });

  it("the machine credential's re-read is recorded as its claim and not judged (the agent's own key could send it); the ids@n is not read for it", async () => {
    const { out, row, deps } = await report({ over: { myRole: async () => "service" } });
    const why = "reported with the machine credential — the agent's own key could send it";
    expect(out.result.as_built).toEqual({ why, reported_role: "service" });
    expect(row.as_built).toEqual({ why, reported_role: "service" });
    expect(deps.resolveArtefact).not.toHaveBeenCalled();
  });

  it("review amendment 4a: an entry over the caps or malformed is dropped and recorded with why — the result itself is never refused", async () => {
    const rowsOf = (n, value = "1") => Array.from({ length: n }, () => ({ name: "x", value }));
    const cases = [
      [(a) => ({ ...a, as_built: { ...a.as_built, psets: Array.from({ length: 51 }, (_, i) => ({ name: `P${i}`, rows: [] })) } }), "psets is not a list of at most 50"],
      [(a) => ({ ...a, as_built: { ...a.as_built, psets: [{ name: "P", rows: rowsOf(101) }] } }), "psets[0] is not {name, rows} with at most 100 rows"],
      [(a) => ({ ...a, as_built: { ...a.as_built, psets: [{ name: "P", rows: rowsOf(1, "y".repeat(513)) }] } }), "psets[0] holds a row that is not {name, value} — scalars of at most 512 characters"],
      [(a) => ({ ...a, as_built: { ...a.as_built, psets: [{ name: "P", rows: rowsOf(1, { nested: 1 }) }] } }), "psets[0] holds a row that is not {name, value} — scalars of at most 512 characters"],
      [(a) => ({ ...a, as_built: { ...a.as_built, identity: { ...a.as_built.identity, Class: ["IFCWALL"] } } }), "identity.Class is not text of at most 512 characters"],
      // MA-6-2 review: a number or a boolean is not a class — sentinel-core would throw on it inside decide (a 500, nothing recorded)
      [(a) => ({ ...a, as_built: { ...a.as_built, identity: { ...a.as_built.identity, Class: 5 } } }), "identity.Class is not text of at most 512 characters"],
      [(a) => ({ ...a, as_built: { ...a.as_built, identity: { ...a.as_built.identity, Class: true } } }), "identity.Class is not text of at most 512 characters"],
      [(a) => ({ ...a, as_built: { ...a.as_built, identity: { ...a.as_built.identity, Name: 7 } } }), "identity.Name is not text of at most 512 characters"],
      [(a) => ({ ...a, as_built: "IFCWALL" }), "not {identity, psets}"],
      [(a) => ({ ...a, readable: "Pset_WallCommon.FireRating" }), "readable is not a list of at most 500 names"],
    ];
    for (const [edit, why] of cases) {
      const { out, g, row } = await report({ edit: (a, i) => (i === 1 ? edit(a) : a) });
      expect(out.status).toBe("applied");
      expect(out.result.as_built.elements[0]).toEqual({ proposal_guid: g[1], class_claimed: "IFCWALL", why: `not kept: ${why}` });
      expect(out.result.as_built).toMatchObject({ judged: 1, passed: 0, failed: 1, not_judged: 1 });
      expect([row.as_built.judged, row.as_built.not_judged]).toEqual([1, 1]);
    }
    // An element of a re-read kind Revit sent no read of (the read threw, or the element was not found) is said too.
    const { out, g } = await report({ edit: (a, i) => { if (i === 3) delete a.as_built; return a; } });
    expect(out.result.as_built.elements[2]).toEqual({ proposal_guid: g[3], class_claimed: "IFCDOOR", why: "Revit sent no as-built read of it" });
    // A backstop: an installed ids@n sentinel-core cannot judge (a specification with no applicability) leaves each element not judged, with why.
    const odd = await report({ ids: { ...FX.ids, specifications: [...FX.ids.specifications, { name: "no applicability", requirements: { attributes: [], properties: [] } }] } });
    expect(odd.out.status).toBe("applied");
    expect(odd.out.result.as_built).toMatchObject({ judged: 0, not_judged: 3 });
    expect(odd.out.result.as_built.elements[0]).toEqual({ proposal_guid: odd.g[1], class_claimed: "IFCWALL", why: expect.stringMatching(/^not judged: Cannot read properties of undefined/) });
  });

  it("review: a wall exported as another class than the one its claim was judged under escaped the spec — not judged, counted, never \"not in scope\"; one element is counted once", async () => {
    const proxy = await report({ edit: (a, i) => (i === 2 ? { ...a, as_built: { ...a.as_built, identity: { ...a.as_built.identity, Class: "IFCBUILDINGELEMENTPROXY" } } } : a) });
    expect(proxy.out.result.as_built).toMatchObject({ judged: 1, passed: 1, failed: 0, not_read: 0, not_judged: 1 });
    expect(proxy.out.result.as_built.elements[1]).toEqual({ proposal_guid: proxy.g[2], class_claimed: "IFCWALL", class_as_built: "IFCBUILDINGELEMENTPROXY",
      global_id_as_built: "5a1c2b3d-1111-2222-3333-444455556666-00061f33", verdict: "exported as IFCBUILDINGELEMENTPROXY — not judged as IFCWALL" });
    expect(proxy.row.as_built).toMatchObject({ judged: 1, passed: 1, failed: 0, not_judged: 1 });
    // Promote's retype and attach of one wall are two entries with one read: listed under each, counted once (JudgeApplied groups by UniqueId).
    const twice = await report({ edit: (a, i) => (i === 2 ? { ...a, ...(({ element, ...w }) => w)(structuredClone(FX.applied[1])) } : a) });
    expect(twice.out.result.as_built.elements.map((e) => e.verdict)).toEqual(["passes", "passes", "not in scope"]);
    expect(twice.out.result.as_built).toMatchObject({ judged: 1, passed: 1, failed: 0, not_judged: 0 });
  });

  it("a set_parameter's entry is a type: an as_built on it is ignored; a result with no as_built stores none and reads no IDS", async () => {
    const VS = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/value-sources.json", import.meta.url), "utf8"));
    const deps = baseDeps({ resolveArtefact: resolving({ type_catalog: VS.catalog, ids: VS.ids }), myRole: async () => "contributor" });
    const cs = await proposeChangeset("ma2c", { name: "Promote (DD) · Level 1", source: "promote", elements: [{
      op: "set_parameter", kind: "wall", target: { unique_id: "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-00000a01" }, place: { TypeName: "BDS_EXT_ARC_CMU_200 mm" },
      parameter: "Pset_WallCommon.FireRating", revit_parameter: "Fire Rating", from: "", to: "60 min", value_source: { kind: "catalogue" },
      validate: { identity: { Class: "IfcWall", Name: "type BDS_EXT_ARC_CMU_200 mm" } } }] }, "lead@office.example", deps);
    const out = await reportResult("ma2c", cs.id, { applied: [{ proposal_guid: cs.elements[0].proposal_guid, revit_element_id: 501, revit_unique_id: "u-501",
      as_built: FX.applied[2].as_built, readable: [] }], rejected: [] }, "lead@office.example", deps);
    expect(out.status).toBe("applied");
    expect(out.result.as_built).toBeUndefined();
    const plain = await report({ edit: (a) => { delete a.as_built; delete a.readable; return a; } });
    expect([plain.out.result.as_built, plain.row.as_built]).toEqual([undefined, undefined]);
    expect(plain.deps.resolveArtefact).not.toHaveBeenCalled();
  });
});

describe("proposeFromJob (MA-6-8): a lead turns a concept IFC job into one changeset per storey — inferred, never pre-ticked, no scan behind it", () => {
  const EV = "e1".repeat(32);
  const STD = { guideline: readRepo("demo/bds-pilot/bds-dd-survey-guideline.json"), type_catalog: readRepo("demo/bds-pilot/bds-type-catalog.json") };
  const resolving = (have) => vi.fn(async (key, kind) => (have[kind] ? installed(kind, have[kind]) : NONE));
  const FRAME = { dx_mm: 0, dy_mm: 0, dz_mm: 0, rotation_deg: 0 };
  const ideps = async (over = {}) => {
    const { runIfc } = await import("./ifc-geometry.mjs");
    const path = new URL("./fixtures/ifc-geometry/revit2024-concept-cv2.ifc", import.meta.url), bytes = readFileSync(path);
    const r = await runIfc({ job_id: "job-0007", items: [{ id: "ev-0001", kind: "model", path: path.pathname.replace(/^\/([A-Za-z]:)/, "$1").replaceAll("%20", " "), sha256: createHash("sha256").update(bytes).digest("hex") }] });
    const TRUSTED = { job: { id: "job-0007", status: "done" }, result: r.result,
      row: { ledger: { id: 3301, hash: "13".repeat(32) }, reader: "sentinel-ifc", version: "0.2.0", pack_id: "evp-0001", items: [{ id: "ev-0001", sha256: EV }], read: ["ev-0001"], result_sha256: "7a".repeat(32) } };
    let n = 3400;
    return baseDeps({ myRole: vi.fn(async () => "lead"), requireMinRole: vi.fn(async () => "lead"), takeWriteBudget: vi.fn(), resolveArtefact: resolving(STD),
      trustedJob: vi.fn(async () => TRUSTED), readPack: vi.fn(async () => ({ pack: { items: [{ id: "ev-0001", sha256: EV, state: "admitted" }] } })),
      manifestLevels: vi.fn(async () => []), audit: vi.fn(async () => ({ id: ++n, hash: "ab".repeat(32) })), ...over });
  };
  const propose = (deps, body = { frame: FRAME }) => proposeFromJob("ma4c-drill", "job-0007", body, "web", deps);

  it("(a) the Revit CV2 concept: two storey changesets, nothing ticked, the planner's row names ifc_row and holds the roof; the door is filed on IFC L02, the column held for its top level (MA-8-4)", async () => {
    const deps = await ideps();
    const r = await propose(deps);
    expect(r.changesets.map((c) => [c.name, c.elements, c.preticked])).toEqual([["IFC job-0007 · IFC L02 job-0007", 8, 0], ["IFC job-0007 · IFC L04 job-0007", 6, 0]]);
    expect(r).toMatchObject({ job: "job-0007", ifc_row: { id: 3301 }, frame: FRAME, already_filed: 0, gaps: { groups: 0 } });
    expect(r.survey_row).toBeUndefined();
    const docs = [...deps.saved.values()];
    expect(docs[0]).toMatchObject({ claimed: false, job: { id: "job-0007", reader: "sentinel-ifc 0.2.0", planner: "ifc-planner 0.2.1", ledger_id: 3301, storey: { cid: "L02", how: "created" } } });
    expect(docs[0].elements.every((e) => e.pretick === false && e.accuracy.status === "inferred" && e.accuracy.basis === "ifc")).toBe(true);
    expect(docs[0].exceptions.map((e) => e.name.split(" ")[0]).sort()).toEqual(["IfcOpeningElement", "column"]);   // the wall's own cut; the column held
    expect(docs[0].exceptions.find((e) => e.name.startsWith("column")).reason).toMatch(/^its top level IFC L04 job-0007 is created by that storey's changeset — apply it, then propose again/);
    expect(docs[0].elements.find((e) => e.kind === "door")).toMatchObject({ place: { FamilyName: "BDS_EXT_1 PNL", TypeName: "BDS_EXT_1 PNL_WOOD_1000 x 2100 mm" }, typing: { typed_by: "bridge-ifc-type" }, pretick: false });
    expect(docs[0].elements.filter((e) => e.kind === "wall").map((e) => e.place.TypeName).sort()).toEqual(
      ["BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_300 mm", "BDS_INT_ARC_CMU_150 mm"]);
    const run = deps.audit.mock.calls.find((c) => c[1] === "build");
    expect(run[3]).toBe("build:run job-0007 · ifc-planner 0.2.1 · proposed");
    expect(run[6]).toMatchObject({ planner: "ifc-planner", ifc_row: { id: 3301 }, claimed: false, model_calls: 0, tokens: 0 });
    expect(run[6].off_storey).toEqual(expect.arrayContaining([expect.objectContaining({ ifc_class: "IFCROOF", count: 1 })]));   // the roof's storey holds nothing to place
    expect(r.off_storey).toEqual(run[6].off_storey);
  });

  it("(a3) MA-8-9: a stair flag rides its storey's changeset exceptions (source ifc); on a storey that files no changeset it rides the build:run row's storeys[].held", async () => {
    const GID = "STAIR00000000000000001";
    const stair = (storey) => ({ global_id: GID, ifc_class: "IFCSTAIR", ifc_name: "IfcStair", storey, why: "a stair — this reader boxes stairs but does not place them; a person places it", box: { min: [0, 0, 0], max: [1200, 5400, 3000] } });
    const deps = await ideps();
    const t = await deps.trustedJob();
    t.result.receipt.not_read.push(stair("L02"));
    const r = await propose(deps);
    const flag = [...deps.saved.values()][0].exceptions.find((e) => e.kind === "stair");
    expect(flag).toMatchObject({ unique_id: `stair:${GID}`, name: `Stair ${GID}`, source: "ifc", global_id: GID, box: { min: [0, 0, 0], max: [1200, 5400, 3000] } });
    expect(r.storeys.find((x) => x.cid === "L02").held).toBeUndefined();
    // L04 keeps one floor the typer cannot type (275 mm: a type gap), so its storey files nothing - its stair flag is said on the planner's row
    const none = await ideps();
    const n = await none.trustedJob();
    const f = n.result.candidates.find((c) => c.kind === "floor" && c.geometry.storey === "L04");
    f.measured.thickness_mm = 275;
    n.result.candidates = n.result.candidates.filter((c) => c.kind === "level" || c.geometry.storey !== "L04" || c === f);
    n.result.receipt.not_read.push(stair("L04"));
    const r2 = await propose(none);
    const l04 = r2.storeys.find((x) => x.cid === "L04");
    expect(l04.changeset).toBeNull();
    expect(l04.held).toEqual([expect.objectContaining({ name: `Stair ${GID}`, kind: "stair", storey: expect.any(String), box: { min: [0, 0, 0], max: [1200, 5400, 3000] }, global_id: GID })]);
    expect(none.audit.mock.calls.find((c) => c[1] === "build")[6].storeys.find((x) => x.cid === "L04").held[0]).toMatchObject({ kind: "stair", global_id: GID });
  });

  it("(a2) review: a 275 mm floor is one type_gap ledger row sourced sentinel-ifc", async () => {
    const deps = await ideps();
    const t = await deps.trustedJob();
    const f = t.result.candidates.find((c) => c.kind === "floor" && c.geometry.storey === "L02");
    f.measured.thickness_mm = 275;
    const r = await propose(deps);
    expect(r.gaps.groups).toBe(1);
    const gap = deps.audit.mock.calls.find((c) => c[1] === "type_gap");
    expect(gap[3]).toMatch(/^type_gap:run job-0007 · ifc-planner · 1 group\(s\), 1 element\(s\)$/);
    expect(gap[6]).toMatchObject({ source: "sentinel-ifc", claimed: false, job: { id: "job-0007" } });
  });

  it("(c) MA-8-3: a vendor's IFC names whose it is — in each changeset's name, its job evidence and the proposed row; a scan job's evidence keeps its shape", async () => {
    const vendor = { id: "ev-0001", sha256: EV, state: "admitted", provider: "acme scans", licence: "commercial", licence_ref: "PO-2026-114" };
    const deps = await ideps({ readPack: vi.fn(async () => ({ pack: { items: [vendor] } })) });
    const r = await propose(deps);
    expect(r.changesets.map((c) => c.name)).toEqual(["IFC (acme scans) job-0007 · IFC L02 job-0007", "IFC (acme scans) job-0007 · IFC L04 job-0007"]);
    const docs = [...deps.saved.values()], ev = { id: "ev-0001", sha256: EV, provider: "acme scans", licence: "commercial", licence_ref: "PO-2026-114" };
    expect(docs[0].job.evidence).toEqual([ev]);
    const proposed = deps.audit.mock.calls.filter((c) => c[3] === "changeset_proposed");
    expect(proposed).toHaveLength(2);
    for (const p of proposed) expect(p[6].evidence).toEqual([ev]);
    // an own model keeps the plain name
    const own = await ideps({ readPack: vi.fn(async () => ({ pack: { items: [{ ...vendor, provider: "own", licence: "owner-supplied", licence_ref: undefined }] } })) });
    expect((await propose(own)).changesets[0].name).toBe("IFC job-0007 · IFC L02 job-0007");
  });

  it("(b) a second run files only the column that waited for its top level; the third finds nothing new; a placed IFC changeset has no scan to measure or show", async () => {
    const d0 = await ideps(); await propose(d0);
    const docs = [...d0.saved.values()];
    const d1 = await ideps({ docList: vi.fn(async () => docs) });
    expect((await propose(d1)).changesets.map((c) => [c.name, c.elements])).toEqual([["IFC job-0007 · IFC L02 job-0007", 1]]);   // IFC L04 is a filed storey now, its level a known one
    expect([...d1.saved.values()][0].elements[0]).toMatchObject({ kind: "column", place: { TopLevel: "IFC L04 job-0007" } });
    const all = [...docs, ...d1.saved.values()];
    await expect(propose(await ideps({ docList: vi.fn(async () => all) }))).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/^nothing new to propose from job-0007 — every candidate that types is filed already/) });
    const cs = { ...docs[0], status: "applied" };
    d0.saved.set(cs.id, cs);
    const as = { ...d0, myRole: vi.fn(async () => "contributor"), requireMinRole: vi.fn(async () => "contributor") };
    await expect(verifyChangeset("ma4c-drill", { changeset: cs.id }, "web", as)).rejects.toMatchObject({ status: 409, message: `${cs.name} was built from an IFC (job-0007) — what a model says, not what was built: there is no scan to measure it against — nothing was saved` });
    await expect(scanOverlay("ma4c-drill", cs.id, as)).rejects.toMatchObject({ status: 409, message: `${cs.name} was built from an IFC (job-0007) — it has no scan to show` });
  });
});

describe("edit cost (MA-8-1)", () => {
  const doc = (over = {}) => ({ id: "c1", name: "c1", status: "applied", elements: [{ proposal_guid: "g0" }, { proposal_guid: "g1" }], job: { id: "job-0001", ledger_id: 40 },
    result: { applied: [{ proposal_guid: "g0", revit_element_id: 1, revit_unique_id: "u0" }], rejected: ["g1"], declined_on_web: [], reported_at: "t1" }, ...over });
  const mk = (docs, over = {}) => baseDeps({ docList: vi.fn(async () => docs), auditAll: vi.fn(async () => []), myRole: async () => "lead",
    takeWriteBudget: vi.fn(), requireMinRole: async () => {}, ...over });

  it("a throwing ledger is a 503 and no numbers", async () => {
    await expect(editCostOf("demo", mk([doc()], { auditAll: vi.fn(async () => { throw new Error("down"); }) }))).rejects.toMatchObject({ status: 503 });
  });

  it("publish: the machine credential and a contributor are 403", async () => {
    await expect(publishEditCost("demo", { run: "job#40" }, "x", mk([doc()], { myRole: async () => "service" }))).rejects.toMatchObject({ status: 403 });
    await expect(publishEditCost("demo", { run: "job#40" }, "x", mk([doc()], { myRole: async () => "contributor" }))).rejects.toMatchObject({ status: 403 });
  });

  it("publish: an unknown run is 404, a pending one 409", async () => {
    await expect(publishEditCost("demo", { run: "nope" }, "x", mk([doc()]))).rejects.toMatchObject({ status: 404 });
    await expect(publishEditCost("demo", { run: "job#40" }, "x", mk([doc({ status: "proposed" })]))).rejects.toMatchObject({ status: 409 });
  });

  it("publish: one row with rests_on; the same numbers on the same rows again is a 409 and writes nothing", async () => {
    const written = [];
    const audit = vi.fn(async (...a) => { written.push(a); return { id: 91, hash: "h" }; });
    const deps = mk([doc()], { audit });
    const out = await publishEditCost("demo", { run: "job#40" }, "lead@example.test", deps);
    expect(out.ledger).toEqual({ id: 91, hash: "h" });
    expect(written).toHaveLength(1);
    expect(written[0][1]).toBe("edit_cost");
    expect(written[0][3]).toMatch(/^edit_cost:published job-0001 \(ledger #40\) · 1\/2 kept/);
    expect(written[0][6]).toMatchObject({ run: "job#40", numbers: { filed: 2, kept: 1, revit: 1 }, rests_on: { applied: "t1", reverted: null } });
    const again = mk([doc()], { audit, auditAll: vi.fn(async (k, f) => (f.entity_type === "edit_cost" ? [{ id: 91, new_value: written[0][6] }] : [])) });
    await expect(publishEditCost("demo", { run: "job#40" }, "x", again)).rejects.toMatchObject({ status: 409 });
    expect(written).toHaveLength(1);
  });

  const jsonbOrder = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1))); // jsonb: shorter keys first

  it("publish: the replay check survives jsonb key order; a new Undo row (same counts, other rests_on) publishes again", async () => {
    const written = [];
    const audit = vi.fn(async (...a) => { written.push(a); return { id: 91, hash: "h" }; });
    await publishEditCost("demo", { run: "job#40" }, "x", mk([doc()], { audit }));
    const stored = jsonbOrder({ ...written[0][6], numbers: jsonbOrder(written[0][6].numbers), rests_on: jsonbOrder(written[0][6].rests_on) });
    const prior = (nv) => mk([doc()], { audit, auditAll: vi.fn(async (k, f) => (f.entity_type === "edit_cost" ? [{ id: 91, new_value: nv }] : [])) });
    await expect(publishEditCost("demo", { run: "job#40" }, "x", prior(stored))).rejects.toMatchObject({ status: 409 });
    expect(written).toHaveLength(1);
    await publishEditCost("demo", { run: "job#40" }, "x", prior({ ...stored, rests_on: { ...stored.rests_on, reverted: 7 } }));
    expect(written).toHaveLength(2);
  });

  it("publish: an Undo row counts (stored applied objects), and the withdrawn ghosts are in the numbers", async () => {
    const rows = [{ id: 5, entity_id: "c1", new_value: { op: "undo", guids: ["g0"] } }];
    const w = doc({ id: "c2", status: "withdrawn" });
    const audit = vi.fn(async () => ({ id: 92, hash: "h" }));
    const out = await publishEditCost("demo", { run: "job#40" }, "x", mk([doc(), w], { audit, auditAll: vi.fn(async () => rows) }));
    expect(out.numbers).toMatchObject({ undone: 1, kept: 0, withdrawn: 2 });
  });

  it("publish: a bad body is a 400 that spends no budget; a ledger-read failure says nothing was saved; a concurrent press is a 409", async () => {
    const deps = mk([doc()]);
    await expect(publishEditCost("demo", {}, "x", deps)).rejects.toMatchObject({ status: 400 });
    expect(deps.takeWriteBudget).not.toHaveBeenCalled();
    await expect(publishEditCost("demo", { run: "job#40" }, "x", mk([doc()], { auditAll: vi.fn(async () => { throw new Error("down"); }) })))
      .rejects.toMatchObject({ status: 503, message: expect.stringMatching(/nothing was saved$/) });
    let release;
    const gate = new Promise((r) => { release = r; });
    const slow = mk([doc()], { audit: vi.fn(async () => { await gate; return { id: 1, hash: "h" }; }) });
    const first = publishEditCost("demo", { run: "job#40" }, "x", slow);
    await new Promise((r) => setTimeout(r, 20));
    await expect(publishEditCost("demo", { run: "job#40" }, "x", slow)).rejects.toMatchObject({ status: 409 });
    release();
    await first;
  });
});

describe("flagChangeset (MA-8-9): a person's stair pick, appended to a changeset's exceptions", () => {
  const BOX = { min: [0, 0, 0], max: [1200, 5400, 3000] };
  const PICK = { kind: "stair", storey: "L01", box: BOX };
  const person = (over = {}) => baseDeps({ myRole: vi.fn(async () => "contributor"), requireMinRole: vi.fn(async () => "contributor"), takeWriteBudget: vi.fn(), ...over });
  const filed = async (deps) => proposeChangeset("demo", BODY, "agent", deps);

  it("appends one flag (source pick, unique_id stair:pick-<8 hex>), bumps review_rev and writes ONE changeset_flagged row; the reply is {flag, ledger}", async () => {
    const deps = person({ audit: vi.fn(async () => ({ id: 41, hash: "ab".repeat(32) })) });
    const cs = await filed(deps);
    deps.audit.mockClear();
    const out = await flagChangeset("demo", cs.id, PICK, "yazan", deps);
    expect(out.flag).toMatchObject({ kind: "stair", storey: "L01", box: BOX, source: "pick", name: "Stair picked on L01" });
    expect(out.flag.unique_id).toMatch(/^stair:pick-[0-9a-f]{8}$/);
    expect(out.flag.reason).toMatch(/^a stair picked by .+ — Sentinel does not place stairs yet; a person adds it; box 1200 × 5400 mm in plan, 3000 mm tall, from \(0, 0, 0\) on L01$/);
    expect(out.ledger).toEqual({ id: 41, hash: "ab".repeat(32) });
    const doc = deps.saved.get(cs.id);
    expect([doc.exceptions, doc.review_rev]).toEqual([[out.flag], 1]);
    expect(deps.docReplaceIfField.mock.calls.at(-1).slice(4, 6)).toEqual(["review_rev", 0]);
    expect(deps.audit.mock.calls).toHaveLength(1);
    expect(deps.audit.mock.calls[0].slice(1, 6)).toEqual(["changeset", cs.id, `changeset_flagged ${cs.name} · stair on L01`, "yazan", { review_rev: 0 }]);
    expect(deps.audit.mock.calls[0][6]).toMatchObject({ review_rev: 1, changeset: cs.id, flag: out.flag });
  });
  it("the same storey and box picked twice is a 409 naming the first flag - a lost reply never makes two flags", async () => {
    const deps = person();
    const cs = await filed(deps);
    const first = await flagChangeset("demo", cs.id, PICK, "yazan", deps);
    await expect(flagChangeset("demo", cs.id, { ...PICK, box: { min: [0.4, 0, 0], max: [1200, 5400, 3000.2] } }, "yazan", deps)).rejects.toMatchObject({ status: 409, message: `already flagged as ${first.flag.unique_id} - nothing was saved` });
    await flagChangeset("demo", cs.id, { ...PICK, storey: "L02" }, "yazan", deps);
    expect(deps.saved.get(cs.id).exceptions).toHaveLength(2);
  });
  it("the machine credential and a viewer save nothing; the budget is taken; a bad body is a 400 in the validator's words", async () => {
    const deps = person();
    const cs = await filed(deps);
    const rows = deps.audit.mock.calls.length;
    const machine = person({ myRole: vi.fn(async () => "service"), requireMinRole: vi.fn(async () => "service") });
    machine.saved.set(cs.id, deps.saved.get(cs.id));
    await expect(flagChangeset("demo", cs.id, PICK, "x", machine)).rejects.toMatchObject({ status: 403, message: "a stair flag is a person's pick — sign in (Standards ▸ Sign in); nothing was saved" });
    const viewer = person({ requireMinRole: vi.fn(async () => { throw Object.assign(new Error("this action requires the contributor role (you are viewer)"), { status: 403 }); }) });
    await expect(flagChangeset("demo", cs.id, PICK, "x", viewer)).rejects.toMatchObject({ status: 403, message: "this action requires the contributor role (you are viewer)" });
    await flagChangeset("demo", cs.id, PICK, "x", deps);
    expect(deps.takeWriteBudget).toHaveBeenCalledWith("flags", { perUser: 20, all: 60 });
    await expect(flagChangeset("demo", cs.id, { ...PICK, box: { min: [0, 0, 0], max: [100, 5400, 3000] } }, "x", deps)).rejects.toMatchObject({ status: 400, message: "flag: the box's plan sides must be 300 to 50000 mm (got 100 × 5400)" });
    await expect(flagChangeset("demo", cs.id, { ...PICK, unique_id: "stair:mine" }, "x", deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/^a stair flag is \{kind, storey, box\} — not unique_id/) });
    await expect(flagChangeset("demo", cs.id, [], "x", deps)).rejects.toMatchObject({ status: 400 });
    expect(deps.audit.mock.calls.length).toBe(rows + 1);
  });
  it("an unknown changeset is a 404, a withdrawn one a 409; 50 picks fill a changeset (409), a full exceptions list is a 413", async () => {
    const deps = person();
    const cs = await filed(deps);
    await expect(flagChangeset("demo", "no-such", PICK, "x", deps)).rejects.toMatchObject({ status: 404 });
    const w = await filed(deps);
    await withdrawChangeset("demo", w.id, "agent", deps);
    await expect(flagChangeset("demo", w.id, PICK, "x", deps)).rejects.toMatchObject({ status: 409, message: `${w.name} is withdrawn — flag the stair on a changeset that is still live; nothing was saved` });
    deps.saved.set(cs.id, { ...deps.saved.get(cs.id), exceptions: Array.from({ length: 50 }, (_, i) => ({ unique_id: `stair:pick-${i}`, reason: "r", kind: "stair", source: "pick" })) });
    await expect(flagChangeset("demo", cs.id, PICK, "x", deps)).rejects.toMatchObject({ status: 409, message: `${cs.name} already holds 50 picked stair flags — nothing was saved` });
    deps.saved.set(cs.id, { ...deps.saved.get(cs.id), exceptions: Array.from({ length: 1000 }, (_, i) => ({ unique_id: `u${i}`, reason: "r" })) });
    await expect(flagChangeset("demo", cs.id, PICK, "x", deps)).rejects.toMatchObject({ status: 413 });
  });
  it("a ledger that does not take the row takes the flag back off the doc (recorded)", async () => {
    const deps = person({ audit: vi.fn(async (...a) => { if (a[3].startsWith("changeset_flagged")) throw new Error("ledger down"); return {}; }) });
    const cs = await filed(deps);
    await expect(flagChangeset("demo", cs.id, PICK, "x", deps)).rejects.toMatchObject({ status: 503 });
    expect(deps.saved.get(cs.id).exceptions).toEqual([]);
  });
  it("the routes: POST /flags (201, the body without actor) and GET /scan?flag= reach the store", () => {
    const src = readFileSync(new URL("./bcf-service.mjs", import.meta.url), "utf8");
    expect(src).toContain('if (p2 && p3 === "flags" && req.method === "POST") { const { actor: _who, ...pick } = body; return send(res, 201, await ch.flagChangeset(key, p2, pick, actor)); }');
    expect(src).toContain('await ch.scanOverlay(key, p2, {}, flag != null ? { flag } : {})');
  });
});

// MA-8-10: a stair is filed from a stair flag of an earlier changeset, and Revit's read of what it built rides on the result and its ledger row
describe("proposeChangeset — a stair from a flag (MA-8-10)", () => {
  const cases = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/stair-cases.json", import.meta.url), "utf8"));
  const f = cases.plan.flag;
  const flagDoc = (over = {}) => ({ id: f.changeset, name: "Survey L00", status: "proposed", elements: [], exceptions: [{ unique_id: f.unique_id, name: f.name, reason: "r", kind: "stair", storey: "L00", box: { min: f.min, max: f.max }, source: "pick" }], ...over });
  const member = (over = {}) => baseDeps({ myRole: vi.fn(async () => "contributor"), requireMinRole: vi.fn(async () => "contributor"), auditAll: vi.fn(async () => []), ...over });
  const withFlag = (deps, over) => { deps.saved.set(f.changeset, flagDoc(over)); return deps; };
  const rows = (deps, action) => deps.audit.mock.calls.filter((c) => c[3] === action);

  it("files the planner's body next to its flag: the stair keeps from_flag, is never pre-ticked, and the filing reads the ledger's Undo rows once", async () => {
    const deps = withFlag(member());
    const cs = await proposeChangeset("demo", structuredClone(cases.good), "yazan", deps);
    expect(cs.status).toBe("proposed");
    expect(cs.elements).toHaveLength(1);
    expect(cs.elements[0]).toMatchObject({ kind: "stair", from_flag: { changeset: f.changeset, unique_id: f.unique_id }, pretick: false, place: { Risers: 16, Going: 250, Width: 1200 } });
    expect(deps.auditAll).toHaveBeenCalledOnce();
    expect(deps.auditAll.mock.calls[0]).toEqual(["demo", { entity_type: "changeset", action_prefix: "changeset_reverted" }]);
    expect(rows(deps, "changeset_proposed")).toHaveLength(1);
  });
  it("a stair with no from_flag reads no ledger (an agent's own stair is filed as it is)", async () => {
    const deps = member();
    const body = structuredClone(cases.good); delete body.elements[0].from_flag;
    await proposeChangeset("demo", body, "agent", deps);
    expect(deps.auditAll).not.toHaveBeenCalled();
  });
  it("a flag the project does not hold, or one on another storey or box, is refused in words and nothing is written (404, 400)", async () => {
    const none = member();
    await expect(proposeChangeset("demo", structuredClone(cases.good), "y", none)).rejects.toMatchObject({ status: 404, message: expect.stringMatching(/^elements\[0\]: from_flag names changeset .* nothing was saved$/) });
    expect(none.docInsert).not.toHaveBeenCalled();
    expect(none.audit).not.toHaveBeenCalled();
    const off = withFlag(member(), { exceptions: [{ unique_id: f.unique_id, name: "n", reason: "r", kind: "stair", storey: "L00", box: { min: [9000, 9000, 0], max: [12000, 10500, 3000] } }] });
    await expect(proposeChangeset("demo", structuredClone(cases.good), "y", off)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/the run leaves the flag's box/) });
    expect(off.docInsert).not.toHaveBeenCalled();
  });
  it("amendment 2: the same flag twice is a 409 while the first is proposed; withdrawn it is free; applied it is built until Undo, and undone it is free again", async () => {
    const deps = withFlag(member());
    const first = await proposeChangeset("demo", structuredClone(cases.good), "y", deps);
    await expect(proposeChangeset("demo", structuredClone(cases.good), "y", deps)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/already proposed as "Stair · L00 → L01 · from Stair picked on L00" — withdraw it first/) });
    await withdrawChangeset("demo", first.id, "y", deps);
    const second = await proposeChangeset("demo", structuredClone(cases.good), "y", deps);
    const g = second.elements[0].proposal_guid;
    await reportResult("demo", second.id, { applied: [{ proposal_guid: g, revit_element_id: 77, revit_unique_id: "u-77", built: { risers: 16, riser_mm: 187.5, going_mm: 250, width_mm: 1200, runs: 1, railings: 2 } }], rejected: [] }, "revit", deps);
    await expect(proposeChangeset("demo", structuredClone(cases.good), "y", deps)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/already built as .* \(applied\) — undo it in Revit first/) });
    deps.auditAll = vi.fn(async () => [{ id: 5, entity_id: second.id, new_value: { op: "undo", guids: [g] } }]);
    const third = await proposeChangeset("demo", structuredClone(cases.good), "y", deps);
    expect(third.elements[0].from_flag.unique_id).toBe(f.unique_id);
  });
  it("review fix: two overlapping filings from one flag - the second is a 409 while the first is being filed, one stair stored", async () => {
    const deps = withFlag(member());
    const [a, b] = await Promise.allSettled([proposeChangeset("demo", structuredClone(cases.good), "y", deps), proposeChangeset("demo", structuredClone(cases.good), "y", deps)]);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
    expect((a.status === "rejected" ? a : b).reason).toMatchObject({ status: 409, message: expect.stringMatching(/a stair from this flag is being filed/) });
    await proposeChangeset("demo", structuredClone(cases.good), "y", deps).catch((e) => expect(e.status).toBe(409)); // the guard is released: this one meets the stored stair instead
  });
  it("a ledger that cannot be read refuses the filing (503) - an Undo of an earlier stair could be missed", async () => {
    const deps = withFlag(member({ auditAll: vi.fn(async () => { throw new Error("db down"); }) }));
    await expect(proposeChangeset("demo", structuredClone(cases.good), "y", deps)).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/the ledger could not be read \(db down\).*nothing was filed/) });
    expect(deps.docInsert).not.toHaveBeenCalled();
  });

  const BUILT = { risers: 16, riser_mm: 187.5, going_mm: 250, width_mm: 1200, runs: 1, railings: 2 };
  const applyWith = async (role, built) => {
    let who = "contributor"; // the filing is a person's; the report is whoever reports
    const deps = withFlag(member({ myRole: vi.fn(async () => who) }));
    const cs = await proposeChangeset("demo", structuredClone(cases.good), "y", deps);
    const g = cs.elements[0].proposal_guid;
    who = role;
    const out = await reportResult("demo", cs.id, { applied: [{ proposal_guid: g, revit_element_id: 77, revit_unique_id: "u-77", ...(built === undefined ? {} : { built }) }], rejected: [] }, "revit", deps);
    return { out, row: deps.audit.mock.calls.find((c) => c[3] === "changeset_applied")[6], g };
  };
  it("a signed-in member's result keeps what Revit built, field by field; the row sets it beside the plan and says they agree", async () => {
    const { out, row, g } = await applyWith("contributor", { ...BUILT, extra: "x" });
    expect(out.result.applied[0].built).toEqual(BUILT);
    expect(row.stairs).toEqual([{ proposal_guid: g, planned: { risers: 16, going_mm: 250, width_mm: 1200 }, built: BUILT, as_planned: true }]);
    expect(row.applied[0].built).toEqual(BUILT);
  });
  it("what Revit built that is not what was planned is on the row as it is, with as_planned false — the row never repeats the plan as if it were done", async () => {
    const { row } = await applyWith("contributor", { ...BUILT, risers: 17, riser_mm: 176.5 });
    expect(row.stairs[0]).toMatchObject({ as_planned: false, built: { risers: 17 }, planned: { risers: 16 } });
  });
  it("no read, or an unusable one, is null and says so; the machine credential's read is not trusted (amendment 13)", async () => {
    for (const built of [undefined, { risers: "16" }, null]) {
      const { out, row } = await applyWith("contributor", built);
      expect(out.result.applied[0].built).toBeNull();
      expect(row.stairs[0]).toMatchObject({ built: null, as_planned: null, note: "Revit sent no read of what it built — check the model" });
    }
    const { out, row } = await applyWith("service", BUILT);
    expect(out.result.applied[0].built).toEqual({ why: "reported with the machine credential — sign in in Revit" });
    expect(row.stairs[0]).toMatchObject({ built: { why: "reported with the machine credential — sign in in Revit" }, as_planned: null });
  });
  it("a changeset with no stair has no stairs on its row, and no built on its entries", async () => {
    const deps = baseDeps({ myRole: vi.fn(async () => "contributor"), requireMinRole: vi.fn(async () => "contributor") });
    const cs = await proposeChangeset("demo", { name: "W", source: "a", elements: [wall()] }, "y", deps);
    const out = await reportResult("demo", cs.id, { applied: [{ proposal_guid: cs.elements[0].proposal_guid, revit_element_id: 5, revit_unique_id: "u", built: BUILT }], rejected: [] }, "revit", deps);
    expect(out.result.applied[0]).not.toHaveProperty("built");
    expect(deps.audit.mock.calls.find((c) => c[3] === "changeset_applied")[6]).not.toHaveProperty("stairs");
  });
});
