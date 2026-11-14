// R3 Task 5: office templates in bimdocs-store — the list, a document made from one, its start, and Save as office template.
// The artefact mechanics (validation, versions, If-Match, the office-only rule) are artefact-store's and are mocked here; doc-templates.test.mjs
// and the PGlite step cover them.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadTemplates, instantiateTemplate } from "./bimdocs-logic.mjs";
import { validateDocTemplates } from "./doc-templates.mjs";

const sb = vi.fn(), ensureProject = vi.fn(), audit = vi.fn();
vi.mock("./cde-store.mjs", () => ({
  sb: (...a) => sb(...a), ensureProject: (...a) => ensureProject(...a), audit: (...a) => audit(...a),
  isUuid: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "")),
  getProjectMeta: vi.fn(async () => ({})),
}));
vi.mock("./members-store.mjs", () => ({
  requireMinRole: vi.fn(async () => "service"),
  requireOfficeLead: vi.fn(async (officeKey, deps, words) => { if (globalThis.__notOfficeLead) throw Object.assign(new Error(words), { status: 403 }); }),
  listMembers: vi.fn(async () => []),
  myMembership: vi.fn(async () => ({ role: "service", party: null, task_team: null, state: "active" })),
  ROLE_RANK: { owner: 4, lead: 3, contributor: 2, viewer: 1 },
}));
vi.mock("./office-scope.mjs", () => ({ officeKeyOf: vi.fn(async () => globalThis.__office ?? null) }));
vi.mock("./office-store.mjs", () => ({ getSnapshot: vi.fn(async () => null), getScan: vi.fn(async () => null) }));
const office = { current: null, version: 0 }; // the office's doc_templates artefact
const put = vi.fn();
vi.mock("./artefact-store.mjs", async (orig) => ({
  ...(await orig()),
  resolveArtefact: vi.fn(async () => (office.current ? { body: office.current, source: "office", ref: `doc_templates@${office.version}`, sha256: `sha${office.version}` } : { body: null, source: "none", ref: null, sha256: null })),
  putArtefact: (...a) => put(...a),
}));

const { listTemplates, createDoc, pickStart, executabilityReport, saveAsTemplate } = await import("./bimdocs-store.mjs");

const comprehensive = () => loadTemplates().find((t) => t.template_id === "bep-comprehensive");
const DOC_ID = "11111111-1111-4111-8111-111111111111";
const makeDoc = (o = {}) => ({ id: DOC_ID, project_id: "proj1", status: "wip", updated_at: "2026-01-01T00:00:00Z", title: "Snowdon BEP", doc_type: "BEP", template_id: "bep-comprehensive", responds_to: null,
  sections: instantiateTemplate(comprehensive(), { title: "x", actor: "a" }).sections, ...o });
let doc;
const install = (templates) => { office.version += 1; office.current = validateDocTemplates({ templates }); };
const entry = (over = {}) => ({ id: "our-bep", doc_type: "BEP", name: "Our BEP", when_to_use: "Every job", variant: "full", sections: [{ key: "eir-response", heading: "1. Response", guidance: "g", blocks: [{ kind: "text", title: "", data: { markdown: "" } }], bindings: { checks: [] } }], starts: comprehensive().starts, ...over });
const patches = () => sb.mock.calls.filter(([, o]) => o?.method === "PATCH");

beforeEach(() => {
  sb.mockReset(); ensureProject.mockReset(); audit.mockReset(); put.mockReset();
  office.current = null; office.version = 0; globalThis.__office = "office1"; globalThis.__notOfficeLead = false;
  doc = makeDoc();
  ensureProject.mockResolvedValue({ id: "proj1" });
  sb.mockImplementation(async (path, o) => (o?.method === "PATCH" ? [{ ...doc, ...o.body }] : o?.method === "POST" ? [{ id: doc.id, doc_type: "BEP", title: "B", ...o.body }] : [doc]));
  put.mockImplementation(async (key, kind, body) => { office.version += 1; office.current = body; return { version: office.version }; });
});

describe("the template list", () => {
  it("GET /bimdocs/templates is the shipped ones only; with a key, the shipped ones then the office's", async () => {
    install([entry()]);
    const shipped = (await listTemplates()).map((t) => t.template_id);
    expect(shipped).not.toContain("office-our-bep");
    const all = await listTemplates("k");
    expect(all.slice(0, shipped.length).map((t) => t.template_id)).toEqual(shipped);
    expect(all.at(-1)).toEqual({ template_id: "office-our-bep", doc_type: "BEP", title: "Our BEP", sections: 1, variant: "full", when_to_use: "Every job", default: false, office: true, version: 1 });
  });
  it("no shipped template's id starts with office- (that prefix marks an office template), and every id fits the database's rule", async () => {
    const ids = (await listTemplates()).map((t) => t.template_id);
    expect(ids.filter((id) => id.startsWith("office-"))).toEqual([]);
    install([entry()]);
    for (const t of await listTemplates("k")) expect(t.template_id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/); // 0049: bim_documents.template_id
  });
  it("the shipped templates are still offered when the office's cannot be read", async () => {
    const { resolveArtefact } = await import("./artefact-store.mjs");
    resolveArtefact.mockRejectedValueOnce(new Error("store down"));
    expect((await listTemplates("k")).map((t) => t.template_id)).toEqual((await listTemplates()).map((t) => t.template_id));
  });
  it("an office with no templates adds none", async () => {
    expect((await listTemplates("k")).length).toBe((await listTemplates()).length);
  });
});

describe("a document made from an office template", () => {
  it("records template_id office-<id> and the artefact's version; an unknown id or the wrong type is a 400 in the shipped words", async () => {
    install([entry()]); install([entry()]); // version 2
    await createDoc("k", { doc_type: "BEP", template_id: "office-our-bep" });
    const posted = sb.mock.calls.find(([p, o]) => p === "bim_documents" && o?.method === "POST")[1].body;
    expect(posted).toMatchObject({ template_id: "office-our-bep", template_version: 2, doc_type: "BEP", title: "Our BEP" });
    expect(posted.sections.map((s) => s.heading)).toEqual(["1. Response"]);
    await expect(createDoc("k", { doc_type: "BEP", template_id: "office-nope" })).rejects.toMatchObject({ status: 400, message: "unknown template 'office-nope' for BEP" });
    await expect(createDoc("k", { doc_type: "EIR", template_id: "office-our-bep" })).rejects.toMatchObject({ status: 400 });
  });
  it("picks a start when saved from the comprehensive BEP, from its own starts", async () => {
    install([entry()]);
    doc = makeDoc({ template_id: "office-our-bep", sections: [{ id: "sec2", heading: "2. Response", template_key: "eir-response", body: "", state: "wip", owner: null, bindings: {}, blocks: [{ id: "sec2.t0", kind: "text", title: "", data: { markdown: "" } }] }] });
    await pickStart("k", doc.id, { start: "no_eir" });
    expect(patches()[0][1].body.sections[0].blocks.map((b) => b.id)).toEqual(["sec2.part-e", "sec2.checklist", "sec2.t0"]);
  });
  it("a template saved from another has no start (422); one removed from the list is a 409 in words — the document still reads", async () => {
    install([entry({ starts: undefined })]);
    doc = makeDoc({ template_id: "office-our-bep" });
    await expect(pickStart("k", doc.id, { start: "no_eir" })).rejects.toMatchObject({ status: 422 });
    office.current = validateDocTemplates({ templates: [] });
    await expect(pickStart("k", doc.id, { start: "no_eir" })).rejects.toMatchObject({ status: 409, message: "The template this document was made from is no longer in the office's list, so a start cannot be picked." });
    expect(patches()).toHaveLength(0);
    expect((await executabilityReport("k", doc.id)).variant).toBeNull(); // opens, scores
  });
  it("executability reads the variant from the office template", async () => {
    install([entry({ variant: "minimal" })]);
    doc = makeDoc({ template_id: "office-our-bep" });
    expect((await executabilityReport("k", doc.id)).variant).toBe("minimal");
  });
});

describe("saveAsTemplate", () => {
  it("saves the document's structure as a new office template: one install on the office, one ledger row on the project", async () => {
    const r = await saveAsTemplate("k", doc.id, { name: "Our BEP", when_to_use: "Every job", variant: "full", keep_content: false, actor: "lead@x" });
    expect(r).toEqual({ template_id: "office-our-bep", office_version: 1 });
    expect(put).toHaveBeenCalledTimes(1);
    const [key, kind, body, opts] = put.mock.calls[0];
    expect([key, kind, opts.ifMatch]).toEqual(["office1", "doc_templates", "none"]);
    expect(body.templates).toHaveLength(1);
    expect(body.templates[0]).toMatchObject({ id: "our-bep", doc_type: "BEP", name: "Our BEP", when_to_use: "Every job", variant: "full" });
    expect(body.templates[0].sections).toHaveLength(doc.sections.length);
    expect(body.templates[0].starts.no_eir.blocks.length).toBeGreaterThan(0);
    expect(audit).toHaveBeenCalledWith("proj1", "bim_document", doc.id, "document_saved_as_template", "lead@x", null, { document_id: doc.id, template_id: "office-our-bep", office_version: 1 });
  });
  it("a second save with the same name makes another; with the id it replaces that one and says the next version; If-Match is what was read", async () => {
    await saveAsTemplate("k", doc.id, { name: "Our BEP" });
    await saveAsTemplate("k", doc.id, { name: "Our BEP" });
    expect(office.current.templates.map((t) => t.id)).toEqual(["our-bep", "our-bep-2"]);
    expect(put.mock.calls[1][3].ifMatch).toBe("sha1");
    const r = await saveAsTemplate("k", doc.id, { id: "our-bep", name: "Our BEP, renamed", keep_content: true });
    expect(r).toEqual({ template_id: "office-our-bep", office_version: 3 });
    expect(office.current.templates.map((t) => t.name)).toEqual(["Our BEP, renamed", "Our BEP"]);
  });
  it("refuses in words, before anything is written: READINESS and TIDP, no name, no office, not a lead of the office", async () => {
    for (const doc_type of ["READINESS", "TIDP"]) {
      doc = makeDoc({ doc_type });
      await expect(saveAsTemplate("k", doc.id, { name: "N" })).rejects.toMatchObject({ status: 400, message: "Only a BEP or an EIR can be an office template." });
    }
    doc = makeDoc();
    await expect(saveAsTemplate("k", doc.id, { name: "  " })).rejects.toMatchObject({ status: 400 });
    globalThis.__office = null;
    await expect(saveAsTemplate("k", doc.id, { name: "N" })).rejects.toMatchObject({ status: 409, message: "This project belongs to no office, so there is nowhere to keep an office template." });
    globalThis.__office = "office1"; globalThis.__notOfficeLead = true;
    await expect(saveAsTemplate("k", doc.id, { name: "N" })).rejects.toMatchObject({ status: 403, message: "Only a lead of the office saves an office template." });
    expect(put).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
  it("a document made from an office template can be saved again (its own starts are carried)", async () => {
    install([entry()]);
    doc = makeDoc({ template_id: "office-our-bep", sections: instantiateTemplate({ ...comprehensive(), template_id: "office-our-bep" }, { title: "x", actor: "a" }).sections });
    await saveAsTemplate("k", doc.id, { name: "Second" });
    expect(office.current.templates.find((t) => t.id === "second").starts.no_eir.blocks.length).toBeGreaterThan(0);
  });
});
