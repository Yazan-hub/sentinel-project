import { describe, it, expect, vi } from "vitest";
import { PARTS, PART_WORDS, validateRegister, getRegister, putRegister, publishedLines } from "./office-register.mjs";
import { KINDS } from "./artefact-store.mjs";
import { canonicalSha256 } from "./canonical.mjs";

const line = (id, extra = {}) => ({ id, publish: false, evidence: "evidenced", evidence_note: "", owner: "", due: "", ...extra });
const empty = () => ({ people: [], software: [], hardware: [], past_projects: [], training: [], terms: [] });
const sample = () => ({
  ...empty(),
  people: [line("bim-mgr", { function: "BIM manager", who: "Dana", competence: "ISO 19650", publish: true })],
  software: [line("revit", { name: "Revit", version: "2025", use: "modelling", publish: true }), line("navis", { name: "Navisworks", version: "2025", use: "clashes" })],
});

const mk = (over = {}) => {
  const docs = new Map();
  const d = {
    docs,
    ensureProject: vi.fn(async () => ({ id: "o1", key: "office-a", kind: "office" })),
    requireMinRole: vi.fn(async () => "lead"),
    docGet: vi.fn(async (pid, id) => docs.get(`${pid}/${id}`) ?? null),
    docInsert: vi.fn(async (pid, id, data) => { docs.set(`${pid}/${id}`, data); }),
    docUpsert: vi.fn(async (pid, id, data) => { docs.set(`${pid}/${id}`, data); }),
    audit: vi.fn(async () => ({})),
    ...over,
  };
  return d;
};
const fails = (fn, re, status = 400) => expect(fn).rejects.toMatchObject({ status, message: expect.stringMatching(re) });

describe("vocabulary", () => {
  it("six parts with words", () => {
    expect(PARTS).toEqual(["people", "software", "hardware", "past_projects", "training", "terms"]);
    expect(PART_WORDS.people).toBe("People and functions");
    expect(PART_WORDS.hardware).toBe("Hardware and IT");
  });
  it("the register is not an artefact kind", () => expect(KINDS).not.toContain("office_register"));
});

describe("validateRegister", () => {
  it("accepts a good body", () => expect(validateRegister(sample())).toBeTruthy());
  it("a bad id", () => {
    const b = sample(); b.software[0].id = "Bad Id";
    expect(() => validateRegister(b)).toThrow(/software\[0\]\.id/);
  });
  it("a duplicate id across parts", () => {
    const b = sample(); b.hardware.push(line("revit", { item: "PC", spec: "x" }));
    expect(() => validateRegister(b)).toThrow(/hardware\[0\]\.id.*repeats/);
  });
  it("a committed line needs owner and due", () => {
    const b = sample(); b.software[0].evidence = "committed";
    expect(() => validateRegister(b)).toThrow(/committed, so it needs an owner and a due date/);
    b.software[0].owner = "Dana"; b.software[0].due = "2026-13-40";
    expect(() => validateRegister(b)).toThrow(/due/);
    b.software[0].due = "2026-12-01";
    expect(validateRegister(b)).toBeTruthy();
  });
  it("an e-mail anywhere is refused", () => {
    const b = sample(); b.people[0].who = "dana@firm.com";
    expect(() => validateRegister(b)).toThrow("the register holds names and roles, not e-mail addresses");
    const c = sample(); c.software[1].evidence_note = "ask a.b@x.org";
    expect(() => validateRegister(c)).toThrow(/e-mail/);
  });
  it("an unknown part and an unknown field", () => {
    expect(() => validateRegister({ ...empty(), pets: [] })).toThrow(/pets is not a part/);
    const b = sample(); b.people[0].phone = "1";
    expect(() => validateRegister(b)).toThrow(/people\[0\]\.phone/);
  });
  it("a missing part, too many lines", () => {
    const { terms, ...rest } = empty();
    expect(() => validateRegister(rest)).toThrow(/terms must be a list/);
    const b = empty(); b.terms = Array.from({ length: 201 }, (_, i) => line(`t${i}`, { term: "a", meaning: "b" }));
    expect(() => validateRegister(b)).toThrow(/at most 200/);
  });
});

describe("getRegister / putRegister", () => {
  it("a project (not an office) is refused", async () => {
    const d = mk({ ensureProject: vi.fn(async () => ({ id: "p1", key: "p", kind: "project" })) });
    await fails(() => getRegister("p", d), /belongs to an office/);
    await fails(() => putRegister("p", sample(), {}, d), /belongs to an office/);
  });
  it("a caller below lead is refused before any read", async () => {
    const d = mk({ requireMinRole: vi.fn(async () => { throw Object.assign(new Error("this action requires the lead role (you are viewer)"), { status: 403 }); }) });
    await fails(() => getRegister("office-a", d), /requires the lead role/, 403);
    await fails(() => putRegister("office-a", sample(), {}, d), /requires the lead role/, 403);
    expect(d.docGet).not.toHaveBeenCalled();
    expect(d.ensureProject).not.toHaveBeenCalled();
    expect(d.docInsert).not.toHaveBeenCalled();
  });
  it("none yet reads null", async () => expect(await getRegister("office-a", mk())).toBeNull());
  it("install writes @1, then the pointer, then the ledger row; the sha is the canonical sha of the body", async () => {
    const d = mk(); const order = [];
    d.docInsert.mockImplementation(async (p, id, data) => { order.push("insert " + id); d.docs.set(`${p}/${id}`, data); });
    d.docUpsert.mockImplementation(async (p, id, data) => { order.push("pointer " + id); d.docs.set(`${p}/${id}`, data); });
    d.audit.mockImplementation(async () => { order.push("audit"); });
    const body = sample();
    const ptr = await putRegister("office-a", body, { actor: "dana", ifMatch: "none" }, d);
    expect(order).toEqual(["insert office_register@1", "pointer office_register", "audit"]);
    expect(ptr).toMatchObject({ version: 1, sha256: canonicalSha256(body) });
    expect(d.audit).toHaveBeenCalledWith("o1", "office_register", null, "office_register_installed", ptr.installed_by, { version: 0 },
      { version: 1, sha256: ptr.sha256, lines: 3, published_lines: 2 });
    const got = await getRegister("office-a", d);
    expect(got.body).toEqual(body);
    expect(got.version).toBe(1);
  });
  it("a stale If-Match is a 412 and nothing is written", async () => {
    const d = mk();
    const p1 = await putRegister("office-a", sample(), { ifMatch: "none" }, d);
    d.docInsert.mockClear();
    await fails(() => putRegister("office-a", empty(), { ifMatch: "none" }, d), /changed by .*reload/, 412);
    await fails(() => putRegister("office-a", empty(), { ifMatch: "deadbeef" }, d), /changed by/, 412);
    expect(d.docInsert).not.toHaveBeenCalled();
    const p2 = await putRegister("office-a", empty(), { ifMatch: `"${p1.sha256}"` }, d);
    expect(p2.version).toBe(2);
  });
  it("a create-only conflict is a 409 in words", async () => {
    const d = mk({ docInsert: vi.fn(async () => { throw Object.assign(new Error("dup"), { status: 409 }); }) });
    await fails(() => putRegister("office-a", sample(), {}, d), /same moment/, 409);
  });
  it("an invalid body is refused before anything is written", async () => {
    const d = mk(); const b = sample(); b.people[0].who = "x@y.com";
    await fails(() => putRegister("office-a", b, {}, d), /e-mail/);
    expect(d.docInsert).not.toHaveBeenCalled();
  });
});

describe("publishedLines", () => {
  it("returns only flagged lines, with the part, and one part when asked", async () => {
    const d = mk(); await putRegister("office-a", sample(), {}, d);
    const all = await publishedLines("o1", null, d);
    expect(all.map((l) => `${l.part}:${l.id}`)).toEqual(["people:bim-mgr", "software:revit"]);
    expect(all[1]).toMatchObject({ part: "software", name: "Revit", evidence: "evidenced", evidence_note: "", owner: "", due: "" });
    expect((await publishedLines("o1", "people", d)).length).toBe(1);
    expect(await publishedLines("o1", "hardware", d)).toEqual([]);
    expect(await publishedLines("other", null, d)).toEqual([]);
  });
});
