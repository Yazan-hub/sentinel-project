import { describe, it, expect, vi, beforeEach } from "vitest";

const bfetch = vi.fn();
vi.mock("./bridge-fetch", () => ({ bfetch: (...a: unknown[]) => bfetch(...a) }));
import { REGISTER_FORM, registerSummary, saveRegister, readRegister } from "./office-register-form";
import type { Row } from "./standard-forms";

const line = (o: Record<string, unknown>) => ({ id: "x", publish: false, evidence: "evidenced", evidence_note: "", owner: "", due: "", ...o });
const body = {
  people: [line({ id: "bim-manager", function: "BIM manager", who: "A. Name", competence: "", publish: true })],
  software: [line({ id: "revit", name: "Revit", version: "2025", use: "Modelling" })],
  hardware: [], past_projects: [], training: [], terms: [],
};
const reply = (status: number, j: unknown) => ({ ok: status < 400, status, json: async () => j });

beforeEach(() => bfetch.mockReset());

describe("REGISTER_FORM", () => {
  it("round-trips a body and keeps line ids", () => {
    const m = REGISTER_FORM.fromBody(body);
    expect(REGISTER_FORM.toBody(m, body, { projectKey: "o" })).toEqual(body);
  });
  it("gives a new line an id from its text plus a counter, unique and valid", () => {
    const m = REGISTER_FORM.fromBody(body);
    const add = (part: string, v: Record<string, string | boolean>) => (m[part] as Row[]).push({ v: { evidence: "evidenced", publish: false, ...v }, orig: {} });
    add("software", { name: "Revit" }); add("software", { name: "Revit" }); add("terms", { term: "!!!" });
    const out = REGISTER_FORM.toBody(m, body, { projectKey: "o" }) as Record<string, { id: string }[]>;
    const ids = Object.values(out).flat().map((l) => l.id);
    expect(out.software.map((l) => l.id).slice(1)).toEqual(["revit-1", "revit-2"]);
    expect(out.terms[0].id).toBe("terms-3");
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]{0,39}$/);
  });
  it("refuses a committed line without owner and due in words", () => {
    const m = REGISTER_FORM.fromBody(body);
    (m.hardware as Row[]).push({ v: { item: "Server", evidence: "committed", owner: "Sam", due: "" }, orig: {} });
    expect(() => REGISTER_FORM.toBody(m, body, { projectKey: "o" })).toThrow("Hardware and IT, line 1 is committed, so it needs an owner and a due date");
    (m.hardware as Row[])[0].v.due = "next week";
    expect(() => REGISTER_FORM.toBody(m, body, { projectKey: "o" })).toThrow("YYYY-MM-DD");
    (m.hardware as Row[])[0].v.due = "2026-12-31";
    expect(() => REGISTER_FORM.toBody(m, body, { projectKey: "o" })).not.toThrow();
  });
});

describe("register routes", () => {
  it("summary counts lines and published lines", () => {
    expect(registerSummary({ version: 3, sha256: "s", body })).toBe("2 lines, 1 published in documents · version 3");
    expect(registerSummary(null)).toBe("Nothing entered yet.");
  });
  it("PUT sends the body with If-Match = the shown sha, or none", async () => {
    bfetch.mockResolvedValue(reply(200, { version: 2, sha256: "n" }));
    await saveRegister("http://b", "off", body, "abc");
    const [url, init] = bfetch.mock.calls[0];
    expect(url).toContain("http://b/cde/off/office-register");
    expect(init.method).toBe("PUT");
    expect(init.headers["If-Match"]).toBe("abc");
    expect(JSON.parse(init.body)).toEqual(body);
    await saveRegister("http://b", "off", body, null);
    expect(bfetch.mock.calls[1][1].headers["If-Match"]).toBe("none");
  });
  it("shows the bridge's words for a stale save and a refused read", async () => {
    bfetch.mockResolvedValueOnce(reply(412, { message: "the office register was changed by x" }));
    await expect(saveRegister("http://b", "off", body, "abc")).rejects.toThrow("the office register was changed by x");
    bfetch.mockResolvedValueOnce(reply(403, { message: "a lead's" }));
    await expect(readRegister("http://b", "off")).rejects.toThrow("a lead's");
    bfetch.mockResolvedValueOnce(reply(200, null));
    expect(await readRegister("http://b", "off")).toBeNull();
  });
});
