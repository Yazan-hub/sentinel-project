import { describe, it, expect, vi } from "vitest";
import { TOOLS, callTool, filterSection } from "./mcp-server.mjs";

const okJson = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
const failText = (status, text) => ({ ok: false, status, json: async () => ({ message: text }), text: async () => text });

const NEW_TOOLS = [
  "sentinel_list_documents", "sentinel_get_document", "sentinel_compliance_report",
  "sentinel_deliverables_status", "sentinel_list_checks", "sentinel_doc_integrity",
];

describe("TOOLS registry", () => {
  it("contains the original three plus the six doc tools", () => {
    const names = TOOLS.map((t) => t.name);
    for (const n of ["sentinel_list_projects", "sentinel_propose", "sentinel_audit", ...NEW_TOOLS])
      expect(names).toContain(n);
    expect(TOOLS).toHaveLength(9);
  });

  it("every tool has a description and an object inputSchema", () => {
    for (const t of TOOLS) {
      expect(t.description?.length).toBeGreaterThan(20);
      expect(t.inputSchema?.type).toBe("object");
    }
  });

  it("integrity tool warns about duration and AI-suggestion status", () => {
    const t = TOOLS.find((t) => t.name === "sentinel_doc_integrity");
    expect(t.description).toMatch(/minutes/i);
    expect(t.description).toMatch(/not compliance facts/i);
  });

  it("required args are declared", () => {
    expect(TOOLS.find((t) => t.name === "sentinel_get_document").inputSchema.required).toEqual(["project", "document"]);
    expect(TOOLS.find((t) => t.name === "sentinel_doc_integrity").inputSchema.required).toEqual(["project", "document"]);
    expect(TOOLS.find((t) => t.name === "sentinel_list_documents").inputSchema.required).toEqual(["project"]);
  });
});

describe("callTool — doc tools dispatch", () => {
  it("list_documents GETs /bimdocs/:project", async () => {
    const fetch = vi.fn(async () => okJson([{ id: "d1" }]));
    const r = await callTool("sentinel_list_documents", { project: "demo" }, { fetch });
    expect(fetch.mock.calls[0][0]).toMatch(/\/bimdocs\/demo$/);
    expect(r).toEqual([{ id: "d1" }]);
  });

  it("get_document GETs /bimdocs/:project/:docId and URL-encodes args", async () => {
    const fetch = vi.fn(async () => okJson({ id: "d1", sections: [] }));
    await callTool("sentinel_get_document", { project: "de mo", document: "d/1" }, { fetch });
    expect(fetch.mock.calls[0][0]).toMatch(/\/bimdocs\/de%20mo\/d%2F1$/);
  });

  it("compliance_report GETs the compliance route", async () => {
    const fetch = vi.fn(async () => okJson({ summary: {} }));
    await callTool("sentinel_compliance_report", { project: "demo", document: "d1" }, { fetch });
    expect(fetch.mock.calls[0][0]).toMatch(/\/bimdocs\/demo\/d1\/compliance$/);
  });

  it("deliverables_status GETs /deliverables/:project/status", async () => {
    const fetch = vi.fn(async () => okJson({ summary: { total: 0 } }));
    await callTool("sentinel_deliverables_status", { project: "demo" }, { fetch });
    expect(fetch.mock.calls[0][0]).toMatch(/\/deliverables\/demo\/status$/);
  });

  it("list_checks GETs /bimdocs/checks with no args", async () => {
    const fetch = vi.fn(async () => okJson({ checks: [], planned: [] }));
    await callTool("sentinel_list_checks", {}, { fetch });
    expect(fetch.mock.calls[0][0]).toMatch(/\/bimdocs\/checks$/);
  });

  it("doc_integrity POSTs with provider/model passthrough", async () => {
    const fetch = vi.fn(async () => okJson({ findings: [], dropped: 0 }));
    await callTool("sentinel_doc_integrity", { project: "demo", document: "d1", provider: "local", model: "m" }, { fetch });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/bimdocs\/demo\/d1\/integrity$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ provider: "local", model: "m" });
  });

  it("missing required args throw before any fetch", async () => {
    const fetch = vi.fn();
    await expect(callTool("sentinel_list_documents", {}, { fetch })).rejects.toThrow(/project is required/);
    await expect(callTool("sentinel_get_document", { project: "demo" }, { fetch })).rejects.toThrow(/document is required/);
    await expect(callTool("sentinel_doc_integrity", { project: "demo" }, { fetch })).rejects.toThrow(/document is required/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bridge errors surface as 'bridge <status>: <text>' with the real message", async () => {
    const fetch = vi.fn(async () => failText(503, '{"message":"Local AI (Ollama) unreachable"}'));
    await expect(callTool("sentinel_doc_integrity", { project: "demo", document: "d1" }, { fetch }))
      .rejects.toThrow(/bridge 503:.*Ollama/);
  });

  it("unknown tool still throws", async () => {
    await expect(callTool("nope", {}, { fetch: vi.fn() })).rejects.toThrow(/unknown tool/);
  });
});

describe("callTool — existing tools regression", () => {
  it("list_projects still GETs /cde/projects", async () => {
    const fetch = vi.fn(async () => okJson([]));
    await callTool("sentinel_list_projects", {}, { fetch });
    expect(fetch.mock.calls[0][0]).toMatch(/\/cde\/projects$/);
  });

  it("audit still GETs and slices to limit", async () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ id: i }));
    const fetch = vi.fn(async () => okJson(rows));
    const r = await callTool("sentinel_audit", { project: "demo", limit: 10 }, { fetch });
    expect(r).toHaveLength(10);
  });

  it("propose still POSTs to /cde/:project/propose", async () => {
    const fetch = vi.fn(async () => okJson({ verdict: "recorded" }));
    await callTool("sentinel_propose", { project: "demo", elements: [] }, { fetch });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/cde\/demo\/propose$/);
    expect(init.method).toBe("POST");
  });
});

describe("filterSection", () => {
  const doc = { id: "d1", title: "BEP", sections: [
    { id: "s1", heading: "Naming", body: "A" },
    { id: "s2", heading: "Milestones", body: "B" },
  ] };

  it("filters by section id", () => {
    const r = filterSection(doc, "s2");
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0].heading).toBe("Milestones");
    expect(r.title).toBe("BEP"); // doc metadata preserved
  });

  it("filters by exact heading when no id matches", () => {
    expect(filterSection(doc, "Naming").sections[0].id).toBe("s1");
  });

  it("no match throws an error listing available sections", () => {
    expect(() => filterSection(doc, "Nope")).toThrow(/s1.*Naming.*s2.*Milestones|Naming.*Milestones/s);
  });

  it("get_document applies the filter when section is passed", async () => {
    const fetch = vi.fn(async () => okJson(doc));
    const r = await callTool("sentinel_get_document", { project: "demo", document: "d1", section: "s1" }, { fetch });
    expect(r.sections).toHaveLength(1);
  });

  it("does not mutate the input document", () => {
    filterSection(doc, "s1");
    expect(doc.sections).toHaveLength(2);
  });
});
