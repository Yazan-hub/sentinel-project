import { describe, it, expect, vi } from "vitest";
import { ANNEXES, listAnnex, addRow, updateRow, removeRow, validateRow } from "./annex-store.mjs";

const refuse = (status, message) => Object.assign(new Error(message), { status });
const ROLES = { owner: 4, lead: 3, contributor: 2, viewer: 1 };

// who: {role, party, task_team, state}; role "service" = the machine credential; role null = not a member / invited
const mk = (who = { role: "contributor", party: "appointed", task_team: "ARC", state: "active" }, over = {}) => {
  const docs = new Map();
  const d = {
    docs,
    ensureProject: vi.fn(async () => ({ id: "p1", key: "demo" })),
    requireMinRole: vi.fn(async (_k, min) => {
      if (who.role === "service") return "service";
      if (!who.role || ROLES[who.role] < ROLES[min]) throw refuse(403, `this action requires the ${min} role (you are ${who.role || "not a member"})`);
      return who.role;
    }),
    myMembership: vi.fn(async () => who),
    docGet: vi.fn(async (pid, id) => docs.get(`${pid}/${id}`) ?? null),
    docInsert: vi.fn(async (pid, id, data) => { if (docs.has(`${pid}/${id}`)) throw refuse(409, "dup"); docs.set(`${pid}/${id}`, data); }),
    docCas: vi.fn(async (pid, id, data, rev) => { const cur = docs.get(`${pid}/${id}`); if (!cur || cur.rev !== rev) return null; docs.set(`${pid}/${id}`, data); return data; }),
    audit: vi.fn(async () => ({})),
    teamCodes: vi.fn(async () => ["ARC", "str"]),
    ...over,
  };
  return d;
};
const as = (role, extra = {}) => mk({ role, party: role === "contributor" ? "appointed" : "lead_appointed", task_team: null, state: "active", ...extra });
const cap = (team, over = {}) => ({ team, area: "software", item: "Revit 2025", evidence: "evidenced", ...over });
const fails = (fn, re, status) => expect(fn).rejects.toMatchObject({ status, message: expect.stringMatching(re) });

describe("the annexes", () => {
  it("three annexes with their columns", () => {
    expect(Object.keys(ANNEXES)).toEqual(["risk_register", "mobilisation", "capability"]);
    expect(ANNEXES.risk_register.words).toBe("Risk register");
    expect(ANNEXES.capability.columns.map((c) => c.key)).toEqual(["team", "area", "item", "evidence", "evidence_note", "owner", "due"]);
  });
  it("an unknown annex name is a 404 on every route", async () => {
    const d = mk();
    await fails(() => listAnnex("demo", "nope", d), /no list called nope/, 404);
    await fails(() => addRow("demo", "nope", {}, { rev: 0 }, d), /no list called/, 404);
    await fails(() => updateRow("demo", "nope", "r-1", {}, { rev: 0 }, d), /no list called/, 404);
    await fails(() => removeRow("demo", "nope", "r-1", { rev: 0 }, d), /no list called/, 404);
    await fails(() => listAnnex("demo", "constructor", d), /no list called/, 404);
  });
  it("values are checked against the columns", () => {
    expect(() => validateRow("risk_register", { risk: "" })).toThrow(/Risk is required/);
    expect(() => validateRow("risk_register", { risk: "x", colour: "red" })).toThrow(/colour is not a column/);
    expect(() => validateRow("risk_register", { risk: "x", likelihood: "extreme" })).toThrow(/Likelihood must be one of/);
    expect(() => validateRow("mobilisation", { activity: "x", due: "2026-02-30" })).toThrow(/Due must be a date/);
    expect(() => validateRow("mobilisation", { activity: "x", done: "yes" })).toThrow(/Done must be yes or no/);
    expect(() => validateRow("risk_register", { risk: "ask joe@x.com" })).toThrow(/not e-mail addresses/);
    expect(() => validateRow("capability", cap("ARC", { evidence: "committed" }))).toThrow(/needs an owner and a due date/);
    expect(validateRow("risk_register", { risk: "x" })).toMatchObject({ likelihood: "low", status: "open", touches: "none" });
  });
});

describe("risks and mobilisation — contributor or above", () => {
  it("a contributor adds, edits and removes; the ledger row has its shape", async () => {
    const d = as("contributor");
    const a = await addRow("demo", "risk_register", { risk: "Late survey", touches: "strategy" }, { rev: 0, actor: "ana" }, d);
    expect(a.rev).toBe(1);
    expect(a.row.id).toMatch(/^r-[0-9a-f]{8}$/);
    expect(d.audit).toHaveBeenLastCalledWith("p1", "annex", null, "annex_row_added", "ana", null, { annex: "risk_register", row: a.row, touches: "strategy" });
    const u = await updateRow("demo", "risk_register", a.row.id, { risk: "Late survey", status: "closed" }, { rev: 1, actor: "ana" }, d);
    expect(u.rev).toBe(2);
    expect(d.audit).toHaveBeenLastCalledWith("p1", "annex", null, "annex_row_changed", "ana", { annex: "risk_register", row: a.row }, { annex: "risk_register", row: u.row, touches: "none" });
    const r = await removeRow("demo", "risk_register", a.row.id, { rev: 2, actor: "ana" }, d);
    expect(r.rev).toBe(3);
    expect(d.audit.mock.calls.at(-1)[3]).toBe("annex_row_removed");
    expect((await listAnnex("demo", "risk_register", d)).rows).toEqual([]);
  });
  it("a viewer reads but cannot write", async () => {
    const d = as("viewer");
    expect((await listAnnex("demo", "mobilisation", d)).rev).toBe(0);
    await fails(() => addRow("demo", "mobilisation", { activity: "x" }, { rev: 0 }, d), /requires the contributor role/, 403);
    expect(d.docInsert).not.toHaveBeenCalled();
  });
  it("a non-member cannot even read", async () => {
    await fails(() => listAnnex("demo", "risk_register", mk({ role: null })), /requires the viewer role/, 403);
  });
});

describe("concurrent edits", () => {
  it("a stale rev is a 409 and nothing is written", async () => {
    const d = as("contributor");
    await addRow("demo", "risk_register", { risk: "a" }, { rev: 0 }, d);
    d.docInsert.mockClear(); d.docCas.mockClear();
    await fails(() => addRow("demo", "risk_register", { risk: "b" }, { rev: 0 }, d), /Someone changed this list meanwhile — reload; nothing was saved\./, 409);
    expect(d.docCas).not.toHaveBeenCalled();
    expect((await listAnnex("demo", "risk_register", d)).rows.length).toBe(1);
  });
  it("two writers that both read rev 1: the second loses the compare-and-swap, nothing is lost", async () => {
    const d = as("contributor");
    await addRow("demo", "risk_register", { risk: "a" }, { rev: 0 }, d);
    // the second writer reads (rev 1) then the first lands before its write
    const real = d.docGet.getMockImplementation();
    let hit = false;
    d.docGet.mockImplementation(async (pid, id) => { const x = await real(pid, id); if (!hit) { hit = true; d.docs.set(`${pid}/${id}`, { rev: 2, rows: [...x.rows, { id: "r-first000", risk: "first" }] }); } return x; });
    await fails(() => addRow("demo", "risk_register", { risk: "second" }, { rev: 1 }, d), /Someone changed this list/, 409);
    expect(d.docs.get("p1/risk_register").rows.map((r) => r.risk)).toEqual(["a", "first"]);
  });
  it("two first writers meet the create-only insert", async () => {
    const d = as("contributor", {});
    d.docInsert.mockImplementation(async () => { throw refuse(409, "dup"); });
    await fails(() => addRow("demo", "risk_register", { risk: "a" }, { rev: 0 }, d), /Someone changed this list/, 409);
  });
  it("a missing rev is a 400", async () => {
    await fails(() => addRow("demo", "risk_register", { risk: "a" }, {}, as("contributor")), /rev is required/, 400);
  });
});

describe("capability — each task team's own members only", () => {
  const firm = (team, role = "contributor", extra = {}) => mk({ role, party: "appointed", task_team: team, state: "active", ...extra });
  it("an ARC Firm contributor writes ARC (any case), the declared code is stored", async () => {
    const d = firm("arc");
    const a = await addRow("demo", "capability", cap("ARC"), { rev: 0, actor: "ana" }, d);
    expect(a.row.team).toBe("ARC");
    const u = await updateRow("demo", "capability", a.row.id, cap("arc", { item: "Revit 2026" }), { rev: 1 }, d);
    expect(u.row).toMatchObject({ team: "ARC", item: "Revit 2026" });
    expect((await removeRow("demo", "capability", a.row.id, { rev: 2 }, d)).rev).toBe(3);
  });
  it("a Firm member of ARC cannot write STR's row, add one for STR, or move a row to STR", async () => {
    const d = firm("ARC");
    await fails(() => addRow("demo", "capability", cap("STR"), { rev: 0 }, d), /your own task team \(ARC\) only/, 403);
    d.docs.set("p1/capability", { rev: 1, rows: [{ id: "r-aaaaaaaa", ...cap("str") }, { id: "r-bbbbbbbb", ...cap("ARC") }] });
    await fails(() => updateRow("demo", "capability", "r-aaaaaaaa", cap("ARC"), { rev: 1 }, d), /your own task team/, 403);
    await fails(() => updateRow("demo", "capability", "r-bbbbbbbb", cap("STR"), { rev: 1 }, d), /your own task team/, 403);
    await fails(() => removeRow("demo", "capability", "r-aaaaaaaa", { rev: 1 }, d), /your own task team/, 403);
    expect(d.docCas).not.toHaveBeenCalled();
  });
  it("a lead of the Lead firm is refused", async () => {
    await fails(() => addRow("demo", "capability", cap("ARC"), { rev: 0 }, mk({ role: "lead", party: "lead_appointed", task_team: null, state: "active" })), /own members/, 403);
    await fails(() => addRow("demo", "capability", cap("ARC"), { rev: 0 }, mk({ role: "owner", party: "lead_appointed", task_team: "ARC", state: "active" })), /own members/, 403);
  });
  it("an invited member (role null) is refused", async () => {
    await fails(() => addRow("demo", "capability", cap("ARC"), { rev: 0 }, mk({ role: null, party: "appointed", task_team: "ARC", state: "invited" })), /own members/, 403);
  });
  it("a viewer of a Firm is refused; so is a Firm member with no team", async () => {
    await fails(() => addRow("demo", "capability", cap("ARC"), { rev: 0 }, firm("ARC", "viewer")), /own members/, 403);
    await fails(() => addRow("demo", "capability", cap("ARC"), { rev: 0 }, firm(null)), /own members/, 403);
  });
  it("the machine credential is refused", async () => {
    await fails(() => addRow("demo", "capability", cap("ARC"), { rev: 0 }, mk({ role: "service", party: null, task_team: null, state: "active" })), /own members/, 403);
  });
  it("an undeclared team is refused", async () => {
    await fails(() => addRow("demo", "capability", cap("XYZ"), { rev: 0 }, firm("XYZ")), /not declared/, 403);
  });
  it("the machine credential may still write risks", async () => {
    const d = mk({ role: "service", party: null, task_team: null, state: "active" });
    expect((await addRow("demo", "risk_register", { risk: "x" }, { rev: 0 }, d)).rev).toBe(1);
  });
});
