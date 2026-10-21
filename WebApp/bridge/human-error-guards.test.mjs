// Human-error guards (spec 2026-10-21): §1 the reasons a person types to apply risky rows (and the batch's) are kept on the result and the
// changeset_applied row, and a risky row applied with none is listed; §3 a governed delete of a copy clash triage found modelled twice — a lead's,
// from clash triage, proved by the clash register — and what Revit read of the copy rides on the result for Revert.
import { describe, it, expect, vi } from "vitest";
import { validateChangeset, riskyByOp, keepDeleted } from "./changesets-logic.mjs";
import { proposeChangeset, reportResult } from "./changesets-store.mjs";

const COPY = "2O2Fr$t4X7Zf8NOew3FLKI", KEEP = "2O2Fr$t4X7Zf8NOew3FLKJ", OTHER = "0aBcDeFgHiJkLmNoPqRsT$";
const del = (copy = COPY, keep = KEEP, over = {}) => ({ op: "delete", kind: "wall", validate: { identity: { Class: "IFCWALL" } }, target: { ifc_guid: copy, keeper_ifc_guid: keep }, ...over });
const DELETES = (els = [del()]) => ({ name: "Clash duplicates · Wall × Wall · Level 1", source: "clash", elements: els });
const wall = () => ({ kind: "wall", validate: { identity: { Class: "IFCWALL", Name: "W1" } }, place: { TypeName: "Generic - 200mm", LevelName: "Level 1", LocationCurve: { start: [0, 0, 0], end: [5000, 0, 0] } } });
const status = (fn, code, re) => { try { fn(); } catch (e) { expect(e.status).toBe(code); if (re) expect(e.message).toMatch(re); return; } throw new Error("expected a refusal"); };

describe("validateChangeset — a delete (§3)", () => {
  it("names its copy and the element kept by IFC GlobalId; never pre-ticked; the class is the bridge's", () => {
    const v = validateChangeset(DELETES(), { member: true });
    expect(v.elements[0]).toMatchObject({ op: "delete", target: { ifc_guid: COPY, keeper_ifc_guid: KEEP }, pretick: false });
    expect(v.elements[0].validate.identity.Class).toBe("IFCWALL");
    expect(v.ignored).toEqual([]);
  });
  it("is a signed-in member's only — the machine credential, the MCP server and an agent file none", () => {
    status(() => validateChangeset(DELETES()), 400, /only a signed-in lead files one/);
  });
  it("refuses a malformed pair, one element kept and deleted, a unique_id or a place, and a second delete of one copy", () => {
    status(() => validateChangeset(DELETES([del("nope", KEEP)]), { member: true }), 400, /IFC GlobalIds/);
    status(() => validateChangeset(DELETES([del(COPY, COPY)]), { member: true }), 400, /one element/);
    status(() => validateChangeset(DELETES([del(COPY, KEEP, { target: { ifc_guid: COPY, keeper_ifc_guid: KEEP, unique_id: "x" } })]), { member: true }), 400, /target.ifc_guid only/);
    status(() => validateChangeset(DELETES([del(COPY, KEEP, { place: { LevelName: "L1" } })]), { member: true }), 400, /takes no place/);
    status(() => validateChangeset(DELETES([del(), del(COPY, OTHER)]), { member: true }), 400, /second delete of the copy/);
  });
  it("travels alone, and a copy is never another row's original", () => {
    status(() => validateChangeset(DELETES([del(), wall()]), { member: true }), 400, /changeset of deletes only/);
    status(() => validateChangeset(DELETES([del(COPY, KEEP), del(KEEP, OTHER)]), { member: true }), 400, /deleted as a copy and kept as another's original/);
  });
  it("a kind outside the list (a level, a grid) is refused", () => {
    status(() => validateChangeset(DELETES([{ ...del(), kind: "level" }]), { member: true }), 400, /not supported for delete/);
  });
});

describe("riskyByOp and keepDeleted", () => {
  it("lists the rows risky by what they do — the Revit window's own list", () => {
    expect(["reshape", "rehost", "delete"].every((op) => riskyByOp({ op, kind: "wall" }))).toBe(true);
    expect(riskyByOp({ kind: "wall" }) && riskyByOp({ op: "create", kind: "grid" }) && riskyByOp({ op: "create", kind: "wall", replaces: {} })).toBe(true);
    expect(riskyByOp({ op: "create", kind: "door" }) || riskyByOp({ op: "set_parameter", kind: "wall" }) || riskyByOp({ op: "retype", kind: "wall" })).toBe(false);
  });
  it("keeps what Revit read of a copy field by field", () => {
    expect(keepDeleted({ keeper_unique_id: "u8", values: [{ id: -1001, name: "Comments", storage: "String", value: "x", extra: 1 }, { id: 1.5, name: "bad", storage: "String", value: "y" }, { id: 2, name: "n", storage: "Blob", value: "z" }], more: 1 }))
      .toEqual({ keeper_unique_id: "u8", values: [{ id: -1001, name: "Comments", storage: "String", value: "x" }] });
    expect(keepDeleted({ values: [] })).toBeNull();
  });
});

const deps = ({ role = "lead", register = [] } = {}) => {
  const saved = new Map();
  return {
    saved,
    ensureProject: vi.fn(async () => ({ id: "p1", key: "demo" })),
    adjudicateProposal: vi.fn(async () => ({ verdict: "recorded", summary: {}, failures: [], ids_source: "none", audit_id: 77 })),
    docInsert: vi.fn(async (store, pid, id, data) => { saved.set(id, data); }),
    docGet: vi.fn(async (store, pid, id) => saved.get(id) ?? null),
    docList: vi.fn(async (store) => (store === "clash" ? register : [...saved.values()])),
    docReplaceIfField: vi.fn(async (store, pid, id, data) => { saved.set(id, data); return data; }),
    audit: vi.fn(async () => ({ id: 5, hash: "h" })),
    auditAll: vi.fn(async () => []),
    requireMinRole: vi.fn(async () => {}),
    myRole: vi.fn(async () => role),
  };
};
const dup = (a = COPY, b = KEEP, model = "A-ARC-M3-XX-M3-A-0001@P01") => ({ signature: `${a}|${b}`, status: "raised", group: "duplicate|Wall × Wall|Level 1|Architecture",
  elements: [{ guid: a, model_id: model, category: "IFCWALL", local_id: 2 }, { guid: b, model_id: model, category: "IFCWALL", local_id: 1 }] });

describe("proposeChangeset — a delete is a lead's, from clash triage, proved by the register (§3)", () => {
  it("files one the clash register holds as a duplicate pair in one model", async () => {
    const d = deps({ register: [dup()] });
    const cs = await proposeChangeset("demo", DELETES(), "lead@x.test", d);
    expect(cs.elements[0]).toMatchObject({ op: "delete", pretick: false });
  });
  it("refuses a contributor, another source, and a pair the register does not prove — nothing is filed", async () => {
    await expect(proposeChangeset("demo", DELETES(), "c@x.test", deps({ role: "contributor", register: [dup()] }))).rejects.toMatchObject({ status: 403, message: expect.stringContaining("lead's or owner's") });
    await expect(proposeChangeset("demo", { ...DELETES(), source: "agent" }, "lead@x.test", deps({ register: [dup()] }))).rejects.toMatchObject({ status: 400, message: expect.stringContaining('source "clash"') });
    for (const register of [[], [{ ...dup(), group: "clash|Wall × Wall|Level 1|Architecture" }], [dup(COPY, KEEP, "x")].map((r) => ({ ...r, elements: [r.elements[0], { ...r.elements[1], model_id: "other@P01" }] }))]) {
      const d = deps({ register });
      await expect(proposeChangeset("demo", DELETES(), "lead@x.test", d)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("does not hold as one element modelled twice") });
      expect(d.docInsert).not.toHaveBeenCalled();
    }
  });
  it("the machine credential files none (the validator's refusal, before the store's)", async () => {
    await expect(proposeChangeset("demo", DELETES(), "svc", deps({ role: "service", register: [dup()] }))).rejects.toMatchObject({ status: 400 });
  });
});

describe("reportResult — tick reasons, the batch reason, unreasoned rows and the delete's record (§1, §3)", () => {
  it("keeps the reasons on the result and the ledger row; a risky row applied with none is listed", async () => {
    const d = deps();
    const cs = await proposeChangeset("demo", { name: "Two walls", source: "agent", elements: [wall(), wall()] }, "lead@x.test", d);
    const [a, b] = cs.elements.map((e) => e.proposal_guid);
    const out = await reportResult("demo", cs.id, { applied: [{ proposal_guid: a, revit_element_id: 1, revit_unique_id: "u1" }, { proposal_guid: b, revit_element_id: 2, revit_unique_id: "u2" }],
      rejected: [], tick_reasons: { [a]: "checked against the drawing" }, batch_reason: null }, "lead@x.test", d);
    expect(out.result.tick_reasons).toEqual({ [a]: "checked against the drawing" });
    const row = d.audit.mock.calls.find((c) => c[3] === "changeset_applied")[6];
    expect(row.tick_reasons).toEqual({ [a]: "checked against the drawing" });
    expect(row.unreasoned).toEqual([b]);
  });
  it("refuses a tick reason for a row the result does not apply, or one that is not one line — nothing is recorded", async () => {
    const d = deps();
    const cs = await proposeChangeset("demo", { name: "A wall", source: "agent", elements: [wall()] }, "lead@x.test", d);
    const g = cs.elements[0].proposal_guid;
    await expect(reportResult("demo", cs.id, { applied: [], rejected: [g], tick_reasons: { [g]: "x" } }, "lead@x.test", d)).rejects.toMatchObject({ status: 400 });
    await expect(reportResult("demo", cs.id, { applied: [{ proposal_guid: g, revit_element_id: 1 }], rejected: [], batch_reason: "two\nlines" }, "lead@x.test", d)).rejects.toMatchObject({ status: 400 });
    expect(d.saved.get(cs.id).status).toBe("proposed");
  });
  it("an applied delete keeps what Revit read of the copy; the row names what was removed and what stays; the machine credential reports none", async () => {
    const d = deps({ register: [dup()] });
    const cs = await proposeChangeset("demo", DELETES(), "lead@x.test", d);
    const g = cs.elements[0].proposal_guid;
    const out = await reportResult("demo", cs.id, { applied: [{ proposal_guid: g, revit_element_id: 9, revit_unique_id: "u9", removed_tags: 1,
      deleted: { keeper_unique_id: "u8", values: [{ id: -1001, name: "Comments", storage: "String", value: "copy" }] } }], rejected: [], tick_reasons: { [g]: "the same wall twice" } }, "lead@x.test", d);
    expect(out.result.applied[0]).toMatchObject({ removed_tags: 1, deleted: { keeper_unique_id: "u8" } });
    const row = d.audit.mock.calls.find((c) => c[3] === "changeset_applied")[6];
    expect(row.removed).toEqual([{ proposal_guid: g, unique_id: "u9", ifc_guid: COPY, kept: KEEP, tags: 1 }]);
    expect(row.unreasoned).toBeUndefined();
    const svc = deps({ role: "lead", register: [dup()] });
    const c2 = await proposeChangeset("demo", DELETES(), "lead@x.test", svc);
    svc.myRole = vi.fn(async () => "service");
    await expect(reportResult("demo", c2.id, { applied: [{ proposal_guid: c2.elements[0].proposal_guid, revit_element_id: 9 }], rejected: [] }, "svc", svc)).rejects.toMatchObject({ status: 403 });
  });
});
