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
    for (const n of ["sentinel_list_projects", "sentinel_propose", "sentinel_audit", "sentinel_ask_app", ...NEW_TOOLS])
      expect(names).toContain(n);
    expect(TOOLS).toHaveLength(16);
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

  it("build status names the candidate kinds sentinel-survey reads (MA-5a: doors and windows)", () => {
    expect(TOOLS.find((t) => t.name === "sentinel_build_status").description).toContain(
      "untyped geometry {cid, kind: level|wall|floor|ceiling|door|window, geometry, measured, evidence[], fit} in millimetres in the scan's own frame");
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

  it("audit passes limit (default 50) and the filters to the route and returns its {rows, total, limit, offset}", async () => {
    const page = { rows: [{ id: 44 }], total: 1, limit: 10, offset: 0 };
    const fetch = vi.fn(async () => okJson(page));
    expect(await callTool("sentinel_audit", { project: "demo", limit: 10, entity_type: "file_version", action_prefix: "verdict:", actor: "" }, { fetch })).toEqual(page);
    expect(fetch.mock.calls[0][0]).toMatch(/\/cde\/demo\/audit\?limit=10&entity_type=file_version&action_prefix=verdict%3A$/);
    await callTool("sentinel_audit", { project: "demo" }, { fetch });
    expect(fetch.mock.calls[1][0]).toMatch(/\/cde\/demo\/audit\?limit=50$/);
  });

  it("propose still POSTs to /cde/:project/propose", async () => {
    const fetch = vi.fn(async () => okJson({ verdict: "recorded" }));
    await callTool("sentinel_propose", { project: "demo", elements: [] }, { fetch });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/cde\/demo\/propose$/);
    expect(init.method).toBe("POST");
  });

  it("propose forwards only its declared fields: an MCP client can neither stamp, register nor override", async () => {
    const fetch = vi.fn(async () => okJson({ verdict: "recorded" }));
    await callTool("sentinel_propose", {
      project: "demo", source: "astra", elements: [], note: "n",
      version_id: "aaaaaaaa-0000-4000-8000-000000000001", register: { name: "x.ifc", size_bytes: 1, sha256: "ab".repeat(32) }, override: "because",
    }, { fetch });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ source: "astra", elements: [], note: "n" });
  });
});

describe("changeset tools", () => {
  it("registry has 16 tools including the two changeset tools, receipt verification and MA-6-1's two reads", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toContain("sentinel_propose_changeset");
    expect(names).toContain("sentinel_changeset_status");
    expect(names).toContain("sentinel_verify_receipt");
    expect(names).toContain("sentinel_lod_state");
    expect(names).toContain("sentinel_standards");
    expect(TOOLS).toHaveLength(16);
  });

  it("propose tool description states the referee model and the vocabulary", () => {
    const t = TOOLS.find((t) => t.name === "sentinel_propose_changeset");
    expect(t.description).toMatch(/human review in Revit/i);
    expect(t.description).toMatch(/nothing is created by this call/i);
    expect(t.description).toMatch(/wall, floor, level, grid/);
    expect(t.description).toMatch(/roof, ceiling, door, window/);
    expect(t.description).toMatch(/door, window, column, furniture/); // MA-1a step 2
    expect(t.description).toMatch(/mid:\[x,y,z\]/);
    expect(t.description).toMatch(/place\.Boundary/);
    // MA-0: the ops and the required type name, or an agent's wall/floor create is a 400
    expect(t.description).toMatch(/retype/);
    expect(t.description).toMatch(/attach/);
    expect(t.description).toMatch(/TypeName/);
    expect(t.description).toMatch(/FamilyName/);
    expect(t.description).toMatch(/facts \{thickness_mm\?, params\?/); // MA-2a: the bridge types from the facts
    expect(t.description).toMatch(/never measured, never guessed/);
    expect(t.description).toMatch(/400 naming what is missing/);
    expect(t.inputSchema.required).toEqual(["project", "name", "elements"]);
  });

  // MA-6-3 (amendment 7): an agent learns vocabulary v2 from this text alone (drill H-1).
  it("propose tool description names vocabulary v2: opening and beam, a roof's Slopes per edge, a column's TopLevel", () => {
    const d = TOOLS.find((t) => t.name === "sentinel_propose_changeset").description;
    expect(d).toMatch(/column, furniture, room, opening, beam\./);
    expect(d).toMatch(/openings \(no type, no family, no Mark\) place\.LevelName and exactly one shape: a rectangle cut in a wall — place\.Location/);
    expect(d).toMatch(/place\.Width and place\.Height \(mm, above 50 and at most 20000\) and place\.SillHeight/);
    expect(d).toMatch(/or a hole in a floor of that level \(a stair void\): place\.Boundary/);
    expect(d).toMatch(/beams place\.LocationCurve \{start:\[x,y,z\], end:\[x,y,z\]\} \(straight, no mid; z = the beam's top\), place\.LevelName and place\.FamilyName with place\.TypeName \(a Structural Framing type\), or facts/);
    expect(d).toMatch(/place\.Slopes — one entry per Boundary edge, Slopes\[i\] for the edge Boundary\[i\]→\[i\+1\] \(a closing point is no edge\), null where the edge defines no slope \(a gable\)/);
    expect(d).toMatch(/a column may name place\.TopLevel, the level its top reaches/);
    expect(d).toMatch(/Every kind but a level, grid, room or opening also needs place\.TypeName/);
  });

  it("propose POSTs the changeset body", async () => {
    const fetch = vi.fn(async () => okJson({ id: "c1", status: "proposed" }));
    await callTool("sentinel_propose_changeset", { project: "demo", name: "N", source: "agent", elements: [{ kind: "level" }] }, { fetch });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/changesets\/demo$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({ name: "N", source: "agent", elements: [{ kind: "level" }] });
  });

  it("status tool GETs one changeset by id, or lists by status", async () => {
    const fetch = vi.fn(async () => okJson({ id: "c1" }));
    await callTool("sentinel_changeset_status", { project: "demo", changeset: "c1" }, { fetch });
    expect(fetch.mock.calls[0][0]).toMatch(/\/changesets\/demo\/c1$/);
    const fetch2 = vi.fn(async () => okJson([]));
    await callTool("sentinel_changeset_status", { project: "demo", status: "proposed" }, { fetch: fetch2 });
    expect(fetch2.mock.calls[0][0]).toMatch(/\/changesets\/demo\?status=proposed$/);
  });

  it("propose requires project, name and elements before any fetch", async () => {
    const fetch = vi.fn();
    await expect(callTool("sentinel_propose_changeset", { project: "demo" }, { fetch })).rejects.toThrow(/name is required/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("build status (MA-4c) reads a project's survey jobs, or one with its candidates — read-only; a missing project is refused before any fetch", async () => {
    const fetch = vi.fn(async () => okJson({ jobs: [] }));
    await callTool("sentinel_build_status", { project: "demo" }, { fetch });
    expect(fetch.mock.calls[0][0]).toMatch(/\/cde\/demo\/build\/jobs$/);
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
    await callTool("sentinel_build_status", { project: "demo", job: "job-0001" }, { fetch });
    expect(fetch.mock.calls[1][0]).toMatch(/\/cde\/demo\/build\/jobs\/job-0001$/);
    await expect(callTool("sentinel_build_status", {}, { fetch })).rejects.toThrow(/project is required/);
    expect(fetch).toHaveBeenCalledTimes(2);
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

describe("agent provenance + receipt tools", () => {
  const tool = (n) => TOOLS.find((t) => t.name === n);

  it("both propose tools invite claimed provenance and say the prompt is hashed", () => {
    for (const n of ["sentinel_propose", "sentinel_propose_changeset"]) {
      const a = tool(n).inputSchema.properties.agent;
      expect(a).toBeTruthy();
      expect(a.description).toMatch(/CLAIMED/);
      expect(a.description).toMatch(/HASHED, never stored/);
    }
  });

  it("the propose description points at the receipt, so an agent knows proof exists", () => {
    expect(tool("sentinel_propose").description).toMatch(/sentinel_verify_receipt/);
  });

  it("verify_receipt takes either a receipt or an audit_id and is described as read-only", () => {
    const t = tool("sentinel_verify_receipt");
    expect(Object.keys(t.inputSchema.properties).sort()).toEqual(["audit_id", "project", "receipt"]);
    expect(t.inputSchema.required).toEqual(["project"]);
    expect(t.description).toMatch(/Read-only/);
  });
});

// MA-1a item 8: the propose tool states the trust rule, forwards the claimed agent block, and never files as the add-in.
describe("sentinel_propose_changeset — contract 2's trust rules (MA-1a item 8)", () => {
  it("the description says what the bridge sets and what an agent's ghost is", () => {
    const t = TOOLS.find((x) => x.name === "sentinel_propose_changeset");
    expect(t.description).toMatch(/pretick, accuracy, confidence, typing, claimed and proposal_guid/);
    expect(t.description).toMatch(/ignored: set by the bridge/);
    expect(t.description).toMatch(/never pre-ticked/);
    expect(t.description).toMatch(/not_measured/);
    expect(t.inputSchema.properties.source.description).toMatch(/dwg and promote are the Revit add-in's/);
  });

  it("forwards the claimed agent block, and files as agent when the label is one of the add-in's sources", async () => {
    const sent = async (args) => {
      const fetch = vi.fn(async () => okJson({ id: "c1", status: "proposed" }));
      await callTool("sentinel_propose_changeset", { project: "demo", name: "N", elements: [{ kind: "level" }], ...args }, { fetch });
      return JSON.parse(fetch.mock.calls[0][1].body);
    };
    expect(await sent({ source: "my-agent", agent: { kind: "agent", model: "m" } })).toEqual({ name: "N", source: "my-agent", elements: [{ kind: "level" }], agent: { kind: "agent", model: "m" } });
    expect((await sent({ source: "promote" })).source).toBe("agent");
    expect((await sent({ source: " DWG " })).source).toBe("agent");
    // Review amendment C1: a source that is not text is never forwarded — the bridge reads contract 2's { reader } object,
    // and { reader: "promote" } would otherwise be stored as the source "promote".
    for (const source of [{ reader: "promote" }, { reader: " DWG " }, ["promote"], 7, null])
      expect((await sent({ source })).source).toBe("agent");
    expect(await sent({})).toEqual({ name: "N", source: "agent", elements: [{ kind: "level" }] });
  });
});

// MA-6-1: an agent reads what judges it (the LOD line, the standards in force), the class is the bridge's, and an Undo shows.
describe("MA-6-1 — agent reads, the bridge's class, Undo in the status", () => {
  const tool = (n) => TOOLS.find((t) => t.name === n);
  // A fetch that answers by path: each entry's key is matched against the requested URL (first match wins).
  const route = (table) => vi.fn(async (url) => {
    const hit = Object.entries(table).find(([k]) => url.includes(k));
    if (!hit) throw new Error(`no route for ${url}`);
    return typeof hit[1] === "function" ? hit[1](url) : okJson(hit[1]);
  });

  it("sentinel_lod_state reads /cde/:key/journey and returns its lod_state only — read-only", async () => {
    const lod = { line: "LOD state: 12/14 at DD — Revit's count (claimed), revit, 2026-10-12 04:00 UTC · ledger #77", share: 0.86, at: "2026-10-12T04:00:00Z", ledger: { id: 77, hash: "ab" } };
    const fetch = vi.fn(async () => okJson({ key: "demo", steps: [], lod_state: lod }));
    expect(await callTool("sentinel_lod_state", { project: "demo" }, { fetch })).toEqual({ lod_state: lod });
    expect(fetch.mock.calls[0][0]).toMatch(/\/cde\/demo\/journey$/);
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
    await expect(callTool("sentinel_lod_state", {}, { fetch })).rejects.toThrow(/project is required/);
  });

  it("sentinel_standards reads guideline and ids whole, lod_matrix as its DD IDS; an unknown kind is refused before any fetch", async () => {
    const fetch = vi.fn(async () => okJson({ kind: "guideline", ref: "guideline@2", body: { rules: [] } }));
    expect(await callTool("sentinel_standards", { project: "demo", kind: "guideline" }, { fetch })).toEqual({ kind: "guideline", ref: "guideline@2", body: { rules: [] } });
    expect(fetch.mock.calls[0][0]).toMatch(/\/cde\/demo\/artefacts\/guideline$/);
    await callTool("sentinel_standards", { project: "demo", kind: "ids" }, { fetch });
    expect(fetch.mock.calls[1][0]).toMatch(/\/cde\/demo\/artefacts\/ids$/);
    await callTool("sentinel_standards", { project: "demo", kind: "lod_matrix" }, { fetch });
    expect(fetch.mock.calls[2][0]).toMatch(/\/cde\/demo\/artefacts\/lod_matrix\/ids$/);
    await expect(callTool("sentinel_standards", { project: "demo", kind: "naming" }, { fetch })).rejects.toThrow(/kind must be one of guideline, type_catalog, ids, lod_matrix/);
    await expect(callTool("sentinel_standards", { project: "demo", kind: "../members" }, { fetch })).rejects.toThrow(/kind must be one of/);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(tool("sentinel_standards").inputSchema.required).toEqual(["project", "kind"]);
  });

  it("type_catalog: one category's rows whole (params too; a row matched by its BuiltInCategory), or the category names with counts", async () => {
    const W1 = { category: "Walls", family: "Basic Wall", type: "BDS_EXT_200", system: true, width_mm: 200, height_mm: null, params: { "Fire Rating": "60 min" } };
    const W2 = { category: "Murs", bic: "OST_Walls", family: "Basic Wall", type: "BDS_INT_100", system: true, width_mm: 100, height_mm: null, params: {} };
    const D1 = { category: "Doors", family: "BDS_INT_1 PNL", type: "1000 x 2100", system: false, width_mm: 1000, height_mm: 2100, params: { "Fire Rating": "FD30" } };
    const fetch = vi.fn(async () => okJson({ kind: "type_catalog", version: 3, ref: "type_catalog@3", source: "office", sha256: "cd".repeat(32), body: { types: [W1, W2, D1] } }));
    const head = { ref: "type_catalog@3", source: "office", sha256: "cd".repeat(32) };
    expect(await callTool("sentinel_standards", { project: "demo", kind: "type_catalog", category: "Walls" }, { fetch })).toEqual({ ...head, category: "Walls", types: [W1, W2] });
    expect(fetch.mock.calls[0][0]).toMatch(/\/cde\/demo\/artefacts\/type_catalog$/);
    expect(await callTool("sentinel_standards", { project: "demo", kind: "type_catalog" }, { fetch })).toEqual({ ...head, categories: { Walls: 1, Murs: 1, Doors: 1 } });
    await expect(callTool("sentinel_standards", { project: "demo", kind: "type_catalog", category: "Stairs" }, { fetch }))
      .rejects.toThrow(/^no Stairs types in type_catalog@3 — its categories: Walls \(1\), Murs \(1\), Doors \(1\)$/);
  });

  it("a standard not installed is an error in words; any other bridge error is passed through", async () => {
    const fetch = vi.fn(async () => failText(404, '{"message":"no guideline artefact installed for demo or its office","reason":"not_installed"}'));
    await expect(callTool("sentinel_standards", { project: "demo", kind: "guideline" }, { fetch })).rejects.toThrow(/^guideline is not installed for demo or its office \(bridge 404: .*not_installed/);
    const down = vi.fn(async () => failText(503, "down"));
    await expect(callTool("sentinel_standards", { project: "demo", kind: "ids" }, { fetch: down })).rejects.toThrow(/^bridge 503: down$/);
    // Review fix: the lod_matrix route's own 404 is "not installed" too; a no_project 404 (a typo'd key, a non-member) is the bridge's words.
    const noMatrix = vi.fn(async () => failText(404, '{"message":"no lod_matrix installed for demo or its office"}'));
    await expect(callTool("sentinel_standards", { project: "demo", kind: "lod_matrix" }, { fetch: noMatrix })).rejects.toThrow(/^lod_matrix is not installed for demo or its office/);
    const typo = vi.fn(async () => failText(404, '{"message":"Project \\"dmeo\\" was not found, or you are not a member of it","reason":"no_project"}'));
    await expect(callTool("sentinel_standards", { project: "dmeo", kind: "guideline" }, { fetch: typo })).rejects.toThrow(/^bridge 404: .*was not found.*no_project/);
  });

  it("the propose description tells an agent the class is the bridge's and how to build: one changeset per storey, own levels, BaseLevel/TopLevel, facts", () => {
    const d = tool("sentinel_propose_changeset").description;
    // Review fix: the description and the 400 agree — the class is still sent, and the kind's class replaces any other.
    expect(d).toMatch(/validate\.identity\.Class is still required: send the kind's class \(wall IFCWALL/);
    expect(d).toMatch(/the bridge sets it from the kind, so any other class, a subtype included, is replaced/);
    expect(d).toMatch(/ignored: set by the bridge from kind/);
    expect(d).toMatch(/file one changeset per storey/);
    expect(d).toMatch(/create your own levels, uniquely named, in the first storey's changeset/);
    expect(d).toMatch(/give walls place\.BaseLevel and place\.TopLevel/);
    expect(d).toMatch(/send facts \(thickness_mm, params\.Location\), not TypeName/);
    expect(d).toMatch(/read sentinel_standards/);
    expect(tool("sentinel_changeset_status").description).toMatch(/`undone`/);
    expect(tool("sentinel_changeset_status").description).toMatch(/result\.as_built/);
    // Review fix: as_built is not promised for every element, and guids is a count.
    expect(tool("sentinel_changeset_status").description).toMatch(/guids: how many elements the Undo removed/);
    // MA-6-2 review: what as_built holds — verdicts and counts, not the values — and the machine credential's shape.
    expect(tool("sentinel_changeset_status").description).toMatch(/only the verdict is stored, not the values\): per element a verdict of passes, fails \(with its failures\), not read \(.*\), not in scope, or exported as another class \(not judged\) — or a why \(not kept, no read\)/);
    expect(tool("sentinel_changeset_status").description).toMatch(/judged, passed, failed, not_read and not_judged count each element once, and other kinds are counted under out_of_scope/);
    expect(tool("sentinel_changeset_status").description).toMatch(/reported with the machine credential it is only \{why, reported_role\}/);
  });

  const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "bbbbbbbb-0000-4000-8000-000000000002", C = "cccccccc-0000-4000-8000-000000000003";
  const undo = (id, entity_id, op, n = 3) => ({ id, at: `2026-10-12T0${id % 10}:00:00Z`, entity_id, action: "changeset_reverted", new_value: { op, guids: Array(n).fill("g"), count: n } });

  it("status: an applied changeset whose newest changeset_reverted row is an Undo reads undone, with its ledger row", async () => {
    const fetch = route({ "/audit?": { rows: [undo(91, A, "undo", 4)], total: 1 }, [`/changesets/demo/${A}`]: { id: A, status: "applied" } });
    const r = await callTool("sentinel_changeset_status", { project: "demo", changeset: A }, { fetch });
    expect(r.undone).toEqual({ ledger_id: 91, at: "2026-10-12T01:00:00Z", guids: 4 });
    expect(fetch.mock.calls[1][0]).toMatch(new RegExp(`/cde/demo/audit\\?entity_type=changeset&action_prefix=changeset_reverted&entity_id=${A}&limit=1000$`));
    expect(fetch.mock.calls[1][1].method).toBeUndefined();
  });

  it("status: a Redo after the Undo (the newest row) reads null; so does an applied changeset with no row", async () => {
    const fetch = route({ "/audit?": { rows: [undo(92, A, "redo"), undo(91, A, "undo")], total: 2 }, [`/changesets/demo/${A}`]: { id: A, status: "applied" } });
    expect((await callTool("sentinel_changeset_status", { project: "demo", changeset: A }, { fetch })).undone).toBeNull();
    const none = route({ "/audit?": { rows: [], total: 0 }, [`/changesets/demo/${A}`]: { id: A, status: "partially_applied" } });
    expect((await callTool("sentinel_changeset_status", { project: "demo", changeset: A }, { fetch: none })).undone).toBeNull();
  });

  it("status: a ledger read that fails, answers without rows, or is cut (total > rows) is {unknown} — never \"not undone\"", async () => {
    for (const audit of [() => failText(503, "the ledger is down"), { message: "no rows here" }, { rows: [undo(91, A, "redo")], total: 2 }]) {
      const fetch = route({ "/audit?": audit, [`/changesets/demo/${A}`]: { id: A, status: "applied" } });
      const r = await callTool("sentinel_changeset_status", { project: "demo", changeset: A }, { fetch });
      expect(r.undone).toEqual({ unknown: expect.stringMatching(/^ledger not read: .+ — an Undo in Revit may not show$/) });
    }
  });

  it("status list: one ledger read for the applied changesets only, its rows mapped to each changeset by entity_id", async () => {
    const list = [{ id: A, status: "applied" }, { id: B, status: "applied" }, { id: C, status: "proposed" }];
    const fetch = route({ "/audit?": { rows: [undo(95, B, "undo", 2), undo(94, A, "redo"), undo(93, A, "undo")], total: 3 }, "/changesets/demo": list });
    const r = await callTool("sentinel_changeset_status", { project: "demo" }, { fetch });
    expect(r.map((c) => c.undone)).toEqual([null, { ledger_id: 95, at: "2026-10-12T05:00:00Z", guids: 2 }, null]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toMatch(new RegExp(`entity_id=${A},${B}&limit=1000$`));
    // nothing applied: no ledger read at all
    const quiet = route({ "/changesets/demo": [{ id: C, status: "proposed" }] });
    expect((await callTool("sentinel_changeset_status", { project: "demo", status: "proposed" }, { fetch: quiet }))[0].undone).toBeNull();
    expect(quiet).toHaveBeenCalledTimes(1);
  });

  // Review fix: a list over a project's whole history reads the ledger 100 ids at a time; a failed read marks only its own changesets.
  it("status list: the ledger is read 100 ids per read, and a failed read is {unknown} for its own changesets only", async () => {
    const id = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
    const list = Array.from({ length: 150 }, (_, n) => ({ id: id(n), status: "applied" }));
    let reads = 0;
    const fetch = route({
      "/audit?": () => (++reads === 1 ? okJson({ rows: [undo(91, id(0), "undo", 1)], total: 1 }) : failText(431, "request header fields too large")),
      "/changesets/demo": list,
    });
    const r = await callTool("sentinel_changeset_status", { project: "demo", status: "applied" }, { fetch });
    expect(fetch).toHaveBeenCalledTimes(3);
    const ids = (k) => new URL(fetch.mock.calls[k][0]).searchParams.get("entity_id").split(",");
    expect(ids(1)).toEqual(list.slice(0, 100).map((c) => c.id));
    expect(ids(2)).toEqual(list.slice(100).map((c) => c.id));
    expect(r[0].undone).toEqual({ ledger_id: 91, at: "2026-10-12T01:00:00Z", guids: 1 });
    expect(r[99].undone).toBeNull();
    expect(r[100].undone).toEqual({ unknown: expect.stringMatching(/^ledger not read: bridge 431: .+ — an Undo in Revit may not show$/) });
    expect(r[149].undone).toEqual(r[100].undone);
  });
});
