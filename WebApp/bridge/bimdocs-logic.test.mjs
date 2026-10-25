import { describe, it, expect } from "vitest";
import { loadTemplates, instantiateTemplate, validateTransition, validateDocTransition, ALLOWED_TRANSITIONS, buildSnapshot, maskVersion, VERSION_KEEP, SNAPSHOT_KEEP } from "./bimdocs-logic.mjs";

describe("loadTemplates", () => {
  it("loads BEP and EIR templates with sections", () => {
    const ts = loadTemplates();
    const types = ts.map((t) => t.doc_type).sort();
    expect(types).toEqual(["BEP", "EIR", "READINESS", "TIDP"]);
    for (const t of ts) expect(t.sections.length).toBeGreaterThan(4);
  });
});

describe("instantiateTemplate", () => {
  it("creates a wip document with fresh ids and reserved bindings", () => {
    const [bep] = loadTemplates().filter((t) => t.doc_type === "BEP");
    const doc = instantiateTemplate(bep, { title: "My BEP", actor: "yazan" });
    expect(doc.doc_type).toBe("BEP");
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
  it("every template is named by its file", () => expect(loadTemplates().map((t) => t.template_id).sort()).toEqual(["bep", "eir", "readiness", "tidp"]));
  it("each new section holds one text block whose markdown is the body", () => {
    const d = instantiateTemplate(loadTemplates().find((t) => t.template_id === "bep"));
    expect(d).toMatchObject({ template_id: "bep", template_version: 1 });
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
