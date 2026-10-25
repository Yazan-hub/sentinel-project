import { describe, it, expect } from "vitest";
import { loadTemplates, pickTemplate, instantiateTemplate, validateTransition, validateDocTransition, ALLOWED_TRANSITIONS, buildSnapshot, maskVersion, VERSION_KEEP, SNAPSHOT_KEEP } from "./bimdocs-logic.mjs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("loadTemplates", () => {
  it("loads BEP and EIR templates with sections", () => {
    const ts = loadTemplates();
    const types = ts.map((t) => t.doc_type).sort();
    expect(types).toEqual(["BEP", "BEP", "EIR", "READINESS", "TIDP"]);
    for (const t of ts) expect(t.sections.length).toBeGreaterThan(4);
  });
});

describe("instantiateTemplate", () => {
  it("creates a wip document with fresh ids and reserved bindings", () => {
    const [bep] = loadTemplates().filter((t) => t.doc_type === "EIR");
    const doc = instantiateTemplate(bep, { title: "My BEP", actor: "yazan" });
    expect(doc.doc_type).toBe("EIR");
    expect(doc.title).toBe("My BEP");
    expect(doc.status).toBe("wip");
    expect(doc.created_by).toBe("yazan");
    expect(doc.sections.length).toBe(bep.sections.length);
    for (const s of doc.sections) {
      expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(s.state).toBe("wip");
      expect(s.owner).toBeNull();
      expect(s.bindings).toEqual({});
      expect(typeof s.body).toBe("string");
    }
    const doc2 = instantiateTemplate(bep, { title: "Again", actor: "x" });
    expect(doc2.sections[0].id).not.toBe(doc.sections[0].id); // fresh ids every time
  });
});

describe("validateTransition", () => {
  it("allows the ISO 19650 flow and rejects the rest", () => {
    expect(validateTransition("wip", "shared")).toBe(true);
    expect(validateTransition("shared", "published")).toBe(true);
    expect(validateTransition("shared", "wip")).toBe(true);
    expect(validateTransition("published", "archived")).toBe(true);
    expect(validateTransition("archived", "wip")).toBe(true);
    expect(validateTransition("wip", "published")).toBe(false); // must go through shared
    expect(validateTransition("published", "wip")).toBe(true);  // next revision — the published VERSION row stays immutable
    expect(validateTransition("published", "shared")).toBe(false);
    expect(validateTransition("nope", "wip")).toBe(false);
  });
  it("exposes the transition table", () => {
    expect(ALLOWED_TRANSITIONS.wip).toContain("shared");
  });
});

describe("buildSnapshot", () => {
  it("freezes the full row with label and author", () => {
    const row = { id: "d1", project_id: "p1", doc_type: "BEP", title: "T", status: "shared", sections: [{ id: "s1" }] };
    const v = buildSnapshot(row, "P01 — first issue", "yazan", 1);
    expect(v).toEqual({ document_id: "d1", version_no: 1, snapshot: row, label: "P01 — first issue", published_by: "yazan" });
  });
});

describe("R1a: templates carry blocks and their id", () => {
  it("every template is named by its file", () => expect(loadTemplates().map((t) => t.template_id).sort()).toEqual(["bep-comprehensive", "bep-comprehensive-minimal", "eir", "readiness", "tidp"]));
  it("each new section holds one text block whose markdown is the body", () => {
    const d = instantiateTemplate(loadTemplates().find((t) => t.template_id === "eir"));
    expect(d).toMatchObject({ template_id: "eir", template_version: 1 });
    for (const s of d.sections) expect(s.blocks).toEqual([{ id: `${s.id}.t0`, kind: "text", title: "", data: { markdown: "" } }]);
  });
  it("READINESS keeps its fields beside the blocks", () => {
    const s = instantiateTemplate(loadTemplates().find((t) => t.template_id === "readiness")).sections.find((x) => x.kind === "declared");
    expect(s).toMatchObject({ kind: "declared", answer: null, due: null, question: expect.any(String), blocks: [expect.objectContaining({ kind: "text" })] });
  });
  it("a document reaches published only by publish; sections keep their table", () => {
    expect(validateDocTransition("shared", "published")).toBe(false);
    expect(validateDocTransition("published", "wip")).toBe(true);
    expect(validateTransition("shared", "published")).toBe(true);
  });
});

describe("maskVersion — the viewer's version (spec section 4, Review Focus 4)", () => {
  const blocks = [{ id: "s1.t0", kind: "text", title: "", data: { markdown: "b" } }];
  const full = { id: "v", document_id: "d", version_no: 1, label: "v1", published_by: "lead@x", published_at: "2026-10-22T10:00:00Z", stage: "pre_appointment", suitability: "S0", revision: null, sha: "ab", round_id: null,
    snapshot: { id: "d", project_id: "p", doc_type: "BEP", title: "T", status: "published", stage: "pre_appointment", suitability: "S0", responds_to: null, responds_to_version: null, template_id: "bep", template_version: 1,
      issuer: "x", access: { u: "editor" }, source: { file_id: "f" }, created_by: "lead@x", created_at: "c", updated_at: "u", future_column: 1,
      sections: [{ id: "s1", heading: "H", guidance: "g", body: "b", state: "wip", owner: "a@x", bindings: { checks: [{ id: "cde.states", params: {} }] }, template_key: "k", answer_hint: "h", blocks, answer: { value: "yes", note: "n", by: "a@x", at: "t" } }] } };
  it("keeps only the listed fields; internal and future ones are dropped", () => {
    const m = maskVersion(full);
    expect(Object.keys(m).sort()).toEqual([...VERSION_KEEP].sort());
    expect(Object.keys(m.snapshot).sort()).toEqual([...SNAPSHOT_KEEP].sort());
    expect(m.snapshot.sections).toEqual([{ id: "s1", heading: "H", guidance: "g", body: "b", state: "wip", owner: "a@x", blocks, answer: { value: "yes", note: "n" } }]);
    expect(full.snapshot.access).toEqual({ u: "editor" }); // the stored row is not touched
  });
  it("odd rows do not throw", () => {
    expect(maskVersion(null)).toEqual({}); expect(maskVersion("x")).toEqual({});
    expect(maskVersion({ version_no: 1, snapshot: 5 })).toEqual({ version_no: 1, snapshot: { sections: [] } });
    expect(maskVersion({ snapshot: { sections: [null, 3, { id: "s", answer: "x" }, { id: "r", answer: null }] } }).snapshot.sections).toEqual([{ id: "s" }, { id: "r", answer: null }]);
  });
});

const KEYS = ["project-information", "eir-response", "roles-and-responsibilities", "information-delivery-strategy", "federation-strategy", "cde-and-workflow", "information-standard",
  "level-of-information-need", "production-methods", "software-hardware-it", "quality-assurance", "capability-and-capacity", "mobilisation", "risk-register", "delivery-plans", "project-documents"];
const MINIMAL = ["project-information", "eir-response", "roles-and-responsibilities", "information-delivery-strategy", "cde-and-workflow", "information-standard", "delivery-plans", "project-documents"];
const BOUND = {
  "roles-and-responsibilities": ["roles.responsibility"], "information-delivery-strategy": ["midp.milestones"], "federation-strategy": ["federation.breakdown"],
  "cde-and-workflow": ["cde.states", "cde.versioned"], "information-standard": ["naming.containers", "cde.suitability"], "level-of-information-need": ["loin.levels"],
  "production-methods": ["project.standards_pack"], "quality-assurance": ["ids.last_verdict", "gate.stage"], "delivery-plans": ["midp.plan_completeness", "midp.review"],
};
const tpl = (id) => loadTemplates().find((t) => t.template_id === id);
const dir = (files) => {
  const d = mkdtempSync(join(tmpdir(), "tpl-"));
  for (const [name, json] of Object.entries(files)) writeFileSync(join(d, name), JSON.stringify(json), "utf8");
  return d;
};
const bep = (o) => ({ doc_type: "BEP", title: "B", sections: [{ key: "a", heading: "A" }, { key: "b", heading: "B" }], ...o });

describe("R1b: template choice", () => {
  it("ships these templates, exactly one default per document type", () => {
    expect(loadTemplates().map((t) => t.template_id).sort()).toEqual(["bep-comprehensive", "bep-comprehensive-minimal", "eir", "readiness", "tidp"]);
    for (const type of ["BEP", "EIR", "READINESS", "TIDP"]) expect(loadTemplates().filter((t) => t.doc_type === type && t.default).length).toBe(1);
  });
  it("the comprehensive BEP: 16 numbered sections in order, pre-bound, with its blocks", () => {
    const t = tpl("bep-comprehensive");
    expect(t).toMatchObject({ doc_type: "BEP", variant: "full", default: true });
    expect(t.sections.map((s) => s.key)).toEqual(KEYS);
    t.sections.forEach((s, i) => expect(s.heading.startsWith(`${i + 1}. `)).toBe(true));
    expect(t.sections[0].heading).toBe("1. Project information");
    expect(t.sections[15].heading).toBe("16. Project documents");
    for (const s of t.sections) expect((s.bindings?.checks ?? []).map((c) => c.id)).toEqual(BOUND[s.key] ?? []);
    const kinds = Object.fromEntries(t.sections.map((s) => [s.key, s.blocks.map((b) => b.kind)]));
    expect(kinds["eir-response"]).toEqual(["text", "table"]);
    expect(kinds["roles-and-responsibilities"]).toEqual(["text", "matrix"]);
    expect(kinds["information-standard"]).toEqual(["text", "naming"]);
    expect(kinds["project-documents"]).toEqual(["text", "references"]);
    expect(kinds["mobilisation"]).toEqual(["text"]);
  });
  it("the minimal variant extends it: 8 sections in the parent's order, its starts, not a default", () => {
    const m = tpl("bep-comprehensive-minimal");
    expect(m).toMatchObject({ doc_type: "BEP", variant: "minimal", default: false, starts: tpl("bep-comprehensive").starts });
    expect(m.sections.map((s) => s.key)).toEqual(MINIMAL);
    m.sections.forEach((s, i) => expect(s.heading.startsWith(`${i + 1}. `), s.heading).toBe(true)); // renumbered: "5. CDE and workflow", not "6."
    expect(tpl("bep-comprehensive").sections[5].heading).toBe("6. Common data environment and workflow"); // the parent is untouched
  });
  it("pickTemplate takes the default whatever the file order, a named one, or refuses in words", () => {
    expect(pickTemplate("BEP", undefined, [...loadTemplates()].reverse()).template_id).toBe("bep-comprehensive");
    expect(pickTemplate("BEP", "bep-comprehensive-minimal").template_id).toBe("bep-comprehensive-minimal");
    expect(() => pickTemplate("BEP", "eir")).toThrow("unknown template 'eir' for BEP");
    expect(() => pickTemplate("XYZ")).toThrow("unknown doc_type 'XYZ'");
  });
  it("refuses two defaults, an unknown parent and an unknown kept section", () => {
    expect(() => loadTemplates(dir({ "a-template.json": bep({ default: true }), "b-template.json": bep({ default: true }) }))).toThrow("templates: BEP needs exactly one default");
    expect(() => loadTemplates(dir({ "a-template.json": bep({ default: true }), "m-template.json": { extends: "nope", keep: ["a"] } }))).toThrow("templates: m extends unknown 'nope'");
    expect(() => loadTemplates(dir({ "a-template.json": bep({ default: true }), "m-template.json": { extends: "a", keep: ["zz"] } }))).toThrow("templates: m keeps unknown section 'zz'");
  });
});
