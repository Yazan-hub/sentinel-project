import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { runWithAuth } from "./bridge-auth.mjs";

// setSectionBindings/complianceReport guard tests need a mocked cde-store.mjs (Supabase network layer)
// so we can assert on the 409/404 guard paths and prove complianceReport never writes. This mirrors
// bimdocs-ingest.test.mjs's vi.mock("./ai-gateway.mjs", ...) pattern, kept in its own file so it never
// interferes with bimdocs-store.test.mjs's unmocked network-rejection tests.
const sb = vi.fn();
const ensureProject = vi.fn();
const audit = vi.fn();
const __docs = new Map();
vi.mock("./cde-store.mjs", () => ({
  sb: (...args) => sb(...args),
  ensureProject: (...args) => ensureProject(...args),
  audit: (...args) => audit(...args),
  // real-shape guard: bimdocs-store now imports isUuid to 404 malformed ids before any network call
  isUuid: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "")),
  docGet: async (s, p, id) => __docs.get(s + id) ?? null,
  docInsert: async (s, p, id, data) => {
    if (__docs.has(s + id)) throw Object.assign(new Error("duplicate"), { status: 409 });
    __docs.set(s + id, data);
  },
  docReplaceIfField: async (s, p, id, data, field, expected) => {
    const cur = __docs.get(s + id);
    if (!cur) return null;
    const actual = cur[field] === undefined ? null : String(cur[field]);
    if (actual !== expected) return null; // CAS lost
    __docs.set(s + id, data);
    return data;
  },
  getProjectMeta: vi.fn(async () => ({})),
  // The real guard's shape (cde-store requireRows): the rows, or a 403 in the caller's words.
  requireRows: (rows, what) => {
    if (Array.isArray(rows) && rows.length) return rows;
    throw Object.assign(new Error(`${what} — nothing was saved`), { status: 403 });
  },
}));
vi.mock("./members-store.mjs", () => ({
  requireMinRole: vi.fn(async (key, min) => {
    if (globalThis.__testRole && globalThis.__testRole !== "service") {
      const rank = { owner: 4, lead: 3, contributor: 2, viewer: 1 };
      if ((rank[globalThis.__testRole] || 0) < rank[min])
        throw Object.assign(new Error(`this action requires the ${min} role`), { status: 403 });
    }
  }),
  listMembers: vi.fn(async () => []),
}));
vi.mock("./office-store.mjs", () => ({
  getSnapshot: vi.fn(async () => ({ source: { kind: "template", title: "T.rte" }, at: "2026-09-10T08:00:00Z", received_at: "2026-09-10T08:00:01Z", pack: { worksets: [] }, catalog: { count: 0, types: [] }, ruleset: null })),
  getScan: vi.fn(async () => null),
}));

const makeDoc = (overrides = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  project_id: "proj1",
  status: "wip",
  updated_at: "2026-01-01T00:00:00Z",
  title: "Doc",
  doc_type: "BEP",
  sections: [{ id: "sec1", heading: "H1", body: "", state: "wip", owner: null, bindings: {} }],
  ...overrides,
});

let doc;
beforeEach(() => {
  sb.mockReset();
  ensureProject.mockReset();
  audit.mockReset();
  doc = makeDoc();
  ensureProject.mockResolvedValue({ id: "proj1" });
  // getDoc issues a plain GET (no opts.method); a PATCH carries opts.method === "PATCH". Route both
  // off the same canned doc so callers only need to mutate `doc` before invoking.
  sb.mockImplementation((path, opts) => Promise.resolve([doc]));
});

const { patchSection, validateSections, createDoc, createDocFromIngest } = await import("./bimdocs-store.mjs");
const tableBlock = { id: "b2", kind: "table", title: "", data: { columns: [{ key: "e", label: "Event", type: "text", choices: [], choices_from: null }], rows: [], group_by_team: false } };
describe("old panel save rule", () => {
  it("a text-only section saves into its one text block and the body is derived", async () => {
    doc.sections[0].blocks = [{ id: "sec1.t0", kind: "text", title: "", data: { markdown: "" } }];
    await patchSection("k", doc.id, "sec1", { body: "new text" });
    const sent = sb.mock.calls.find(([, o]) => o?.method === "PATCH")[1].body.sections[0];
    expect(sent).toMatchObject({ body: "new text", blocks: [{ id: "sec1.t0", kind: "text", data: { markdown: "new text" } }] });
  });
  it("a section with a table refuses a changed body with 422 and writes nothing", async () => {
    doc.sections[0] = { ...doc.sections[0], body: "a", blocks: [{ id: "t", kind: "text", title: "", data: { markdown: "a" } }, tableBlock] };
    await expect(patchSection("k", doc.id, "sec1", { body: "b" })).rejects.toMatchObject({ status: 422, message: "This section has tables or other parts; edit it in the workspace. Nothing was saved." });
    expect(sb.mock.calls.some(([, o]) => o?.method === "PATCH")).toBe(false);
  });
  it("the same section saves a new section lead and state when the body is unchanged", async () => {
    doc.sections[0] = { ...doc.sections[0], body: "a", blocks: [{ id: "t", kind: "text", title: "", data: { markdown: "a" } }, tableBlock] };
    await patchSection("k", doc.id, "sec1", { body: "a", owner: "lead@x", state: "shared" });
    const sent = sb.mock.calls.find(([, o]) => o?.method === "PATCH")[1].body.sections[0];
    expect(sent).toMatchObject({ owner: "lead@x", state: "shared", blocks: doc.sections[0].blocks });
  });
  it("a pre-migration section (no blocks) saves as one text block", async () => {
    delete doc.sections[0].blocks;
    await patchSection("k", doc.id, "sec1", { body: "x" });
    expect(sb.mock.calls.find(([, o]) => o?.method === "PATCH")[1].body.sections[0].blocks).toEqual([{ id: "sec1.t0", kind: "text", title: "", data: { markdown: "x" } }]);
  });
  it("ingested sections arrive as one text block each", () =>
    expect(validateSections([{ heading: "H", body: "b" }])[0]).toMatchObject({ body: "b", blocks: [{ kind: "text", data: { markdown: "b" } }] }));
  it("changing the section lead is a lead's; a contributor still edits the body with the owner unchanged", async () => {
    globalThis.__testRole = "contributor";
    try {
      await expect(patchSection("k", doc.id, "sec1", { owner: "someone@x" })).rejects.toMatchObject({ status: 403 });
      expect(sb.mock.calls.some(([, o]) => o?.method === "PATCH")).toBe(false);
      await patchSection("k", doc.id, "sec1", { body: "text", owner: null, state: "wip" });
      expect(sb.mock.calls.find(([, o]) => o?.method === "PATCH")[1].body.sections[0].body).toBe("text");
    } finally {
      globalThis.__testRole = undefined;
    }
  });
  it("both creates record the template they came from", async () => {
    sb.mockImplementation(async (p, o) => (o?.method === "POST" ? [{ id: doc.id, doc_type: "BEP", title: "B" }] : [doc]));
    const posted = () => sb.mock.calls.find(([p, o]) => p === "bim_documents" && o?.method === "POST")[1].body;
    await createDoc("k", { doc_type: "BEP" });
    expect(posted()).toMatchObject({ template_id: "bep", template_version: 1 });
    sb.mockClear();
    await createDocFromIngest("k", { doc_type: "EIR", sections: [{ heading: "H", body: "b" }] });
    expect(posted()).toMatchObject({ template_id: "eir", template_version: 1 });
  });
});

const { addSection, removeSection, renameSection, reorderSections, transitionDoc } = await import("./bimdocs-store.mjs");
const sentSections = () => sb.mock.calls.find(([, o]) => o?.method === "PATCH")[1].body.sections;
describe("section operations (lead and above, ledgered with the outline)", () => {
  beforeEach(() => { doc.sections.push({ id: "sec2", heading: "H2", body: "", state: "wip", owner: null, bindings: { checks: [{ id: "naming.containers", params: {} }] }, blocks: [] }); });
  it("adds after a section, with one empty text block", async () => {
    await addSection("k", doc.id, { heading: " Risks ", after: "sec1" });
    const s = sentSections();
    expect(s.map((x) => x.heading)).toEqual(["H1", "Risks", "H2"]);
    expect(s[1].blocks).toEqual([{ id: `${s[1].id}.t0`, kind: "text", title: "", data: { markdown: "" } }]);
    expect(audit).toHaveBeenCalledWith("proj1", "bim_document", doc.id, "document_structure_changed", "web",
      { outline: [{ id: "sec1", heading: "H1" }, { id: "sec2", heading: "H2" }] },
      expect.objectContaining({ op: "add", section_id: s[1].id, outline: expect.arrayContaining([{ id: s[1].id, heading: "Risks" }]) }));
  });
  it("renames and reorders", async () => {
    await renameSection("k", doc.id, "sec1", { heading: "Project information" });
    expect(sentSections()[0].heading).toBe("Project information");
    sb.mockClear();
    await reorderSections("k", doc.id, { order: ["sec2", "sec1"] });
    expect(sentSections().map((x) => x.id)).toEqual(["sec2", "sec1"]);
    await expect(reorderSections("k", doc.id, { order: ["sec2"] })).rejects.toMatchObject({ status: 400, message: "the new order must name every section once" });
  });
  it("removing a bound section asks first and names the check that left", async () => {
    await expect(removeSection("k", doc.id, "sec2", {})).rejects.toMatchObject({ status: 422, message: "This section is bound to checks (naming.containers); confirm to remove it. Nothing was saved." });
    await removeSection("k", doc.id, "sec2", { confirm_bound: true });
    expect(audit).toHaveBeenLastCalledWith("proj1", "bim_document", doc.id, "document_structure_changed", "web", expect.anything(),
      expect.objectContaining({ op: "remove", section_id: "sec2", checks_removed: ["naming.containers"] }));
  });
  it("refuses an empty heading, the last section, and a contributor", async () => {
    await expect(addSection("k", doc.id, { heading: "  " })).rejects.toMatchObject({ status: 400, message: "a section needs a heading" });
    await expect(addSection("k", doc.id, { heading: 123 })).rejects.toMatchObject({ status: 400 });
    doc.sections = doc.sections.slice(0, 1);
    await expect(removeSection("k", doc.id, "sec1", {})).rejects.toMatchObject({ status: 422, message: "A document keeps at least one section. Nothing was saved." });
    globalThis.__testRole = "contributor";
    try {
      await expect(renameSection("k", doc.id, "sec1", { heading: "X" })).rejects.toMatchObject({ status: 403 });
    } finally {
      globalThis.__testRole = undefined;
    }
  });
  it("holds at most 120 sections", async () => {
    const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, heading: `H${i}`, body: "", state: "wip", owner: null, bindings: {} }));
    doc.sections = mk(120);
    await expect(addSection("k", doc.id, { heading: "X" })).rejects.toMatchObject({ status: 422, message: "A document holds at most 120 sections. Nothing was saved." });
    expect(sb.mock.calls.some(([, o]) => o?.method === "PATCH")).toBe(false);
    doc.sections = mk(119);
    await addSection("k", doc.id, { heading: "X" });
    expect(sentSections()).toHaveLength(120);
  });
  it("refuses a published document", async () => { doc.status = "published"; await expect(addSection("k", doc.id, { heading: "X" })).rejects.toMatchObject({ status: 409 }); });
});

describe("a shared document cannot be moved to published by a transition", () => {
  it("is a 400 and nothing is written", async () => {
    doc.status = "shared";
    await expect(transitionDoc("k", doc.id, { to: "published" })).rejects.toMatchObject({ status: 400 });
    expect(sb.mock.calls.some(([, o]) => o?.method === "PATCH")).toBe(false);
  });
});

const { addBlock, editBlock, removeBlock, reorderBlocks } = await import("./bimdocs-store.mjs");
describe("block operations (contributor and above)", () => {
  beforeEach(() => { doc.sections[0] = { ...doc.sections[0], body: "intro", blocks: [{ id: "sec1.t0", kind: "text", title: "", data: { markdown: "intro" } }] }; });
  it("adds a table after the text and rewrites the body", async () => {
    await addBlock("k", doc.id, "sec1", { kind: "table", title: "Dates", data: { columns: [{ key: "e", label: "Event", type: "text" }], rows: [{ cells: { e: "Award" } }] } });
    const s = sentSections()[0];
    expect(s.blocks.map((b) => b.kind)).toEqual(["text", "table"]);
    expect(s.body).toBe("intro\n\nDates\nEvent\nAward");
    expect(audit).toHaveBeenCalledWith("proj1", "bim_document", doc.id, "block_changed", "web", null,
      expect.objectContaining({ op: "add", section: "H1", kind: "table", block_id: s.blocks[1].id, body_chars: s.body.length }));
  });
  it("edits, reorders and removes", async () => {
    await editBlock("k", doc.id, "sec1", "sec1.t0", { data: { markdown: "changed" } });
    expect(sentSections()[0]).toMatchObject({ body: "changed", blocks: [{ id: "sec1.t0", kind: "text", data: { markdown: "changed" } }] });
    doc.sections[0].blocks.push({ id: "b2", kind: "text", title: "", data: { markdown: "two" } });
    sb.mockClear(); await reorderBlocks("k", doc.id, "sec1", { order: ["b2", "sec1.t0"] });
    expect(sentSections()[0].blocks.map((b) => b.id)).toEqual(["b2", "sec1.t0"]);
    sb.mockClear(); await removeBlock("k", doc.id, "sec1", "b2");
    expect(sentSections()[0]).toMatchObject({ body: "intro", blocks: [{ id: "sec1.t0" }] });
  });
  it("refuses invalid data, an unknown block, and a viewer", async () => {
    await expect(editBlock("k", doc.id, "sec1", "sec1.t0", { data: { markdown: 5 } })).rejects.toMatchObject({ status: 400 });
    await expect(removeBlock("k", doc.id, "sec1", "nope")).rejects.toMatchObject({ status: 404, message: "block not found" });
    await expect(reorderBlocks("k", doc.id, "sec1", { order: [] })).rejects.toMatchObject({ status: 400, message: "the new order must name every block once" });
    globalThis.__testRole = "viewer";
    try {
      await expect(addBlock("k", doc.id, "sec1", { kind: "text" })).rejects.toMatchObject({ status: 403 });
    } finally {
      globalThis.__testRole = undefined;
    }
    expect(audit).not.toHaveBeenCalled();
  });
  it("holds at most 60 blocks", async () => {
    const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: `b${i}`, kind: "text", title: "", data: { markdown: "x" } }));
    doc.sections[0].blocks = mk(60);
    await expect(addBlock("k", doc.id, "sec1", { kind: "text" })).rejects.toMatchObject({ status: 422, message: "A section holds at most 60 blocks. Nothing was saved." });
    expect(sb.mock.calls.some(([, o]) => o?.method === "PATCH")).toBe(false);
    doc.sections[0].blocks = mk(59);
    await addBlock("k", doc.id, "sec1", { kind: "text" });
    expect(sentSections()[0].blocks).toHaveLength(60);
  });
});
