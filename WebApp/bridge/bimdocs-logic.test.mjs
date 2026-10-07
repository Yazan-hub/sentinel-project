import { describe, it, expect } from "vitest";
import { loadTemplates, instantiateTemplate, validateTransition, ALLOWED_TRANSITIONS, buildSnapshot } from "./bimdocs-logic.mjs";

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
