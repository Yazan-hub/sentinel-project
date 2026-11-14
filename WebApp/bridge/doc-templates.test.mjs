// R3 Task 5: the office's document templates — the artefact, a template saved from a document, instantiated like a shipped one.
import { describe, it, expect } from "vitest";
import { validateDocTemplates, templateFromDocument, officeTemplates, templateIdFor, knowChecks, ONLY_BEP_EIR } from "./doc-templates.mjs";
import { loadTemplates, instantiateTemplate } from "./bimdocs-logic.mjs";
import { validateArtefact, KINDS } from "./artefact-store.mjs";

const disk = (id) => loadTemplates().find((t) => t.template_id === id);
const source = () => instantiateTemplate(disk("bep-comprehensive"), { title: "Snowdon BEP", actor: "a" });
const shape = (d) => d.sections.map((s) => ({
  heading: s.heading, guidance: s.guidance, key: s.template_key, bindings: s.bindings,
  blocks: s.blocks.map((b) => ({ kind: b.kind, title: b.title, columns: b.data.columns?.map((c) => [c.key, c.label, c.type]), preset: b.data.preset })),
}));
const entry = (doc, over = {}) => templateFromDocument(doc, disk("bep-comprehensive"), { id: "my-bep", name: "Our BEP", when_to_use: "Every job", variant: "full", ...over });
const art = (...entries) => ({ version: 3, body: validateDocTemplates({ templates: entries }) });

describe("validateDocTemplates", () => {
  const ok = () => entry(source());
  it("accepts a template saved from a document, and an empty list", () => {
    expect(() => validateDocTemplates({ templates: [ok()] })).not.toThrow();
    expect(validateDocTemplates({ templates: [] })).toEqual({ templates: [] });
  });
  it("refuses in words: not an object, not a list, too many, a bad or repeated id", () => {
    expect(() => validateDocTemplates(null)).toThrow(/must be an object/);
    expect(() => validateDocTemplates({})).toThrow(/templates must be a list/);
    expect(() => validateDocTemplates({ templates: Array.from({ length: 21 }, () => ok()) })).toThrow(/at most 20/);
    expect(() => validateDocTemplates({ templates: [{ ...ok(), id: "A" }] })).toThrow(/templates\[0\]\.id/);
    expect(() => validateDocTemplates({ templates: [ok(), ok()] })).toThrow(/repeats another template's id \(my-bep\)/);
  });
  it("refuses READINESS and TIDP, a long name and a long when-to-use text", () => {
    for (const doc_type of ["READINESS", "TIDP", undefined]) expect(() => validateDocTemplates({ templates: [{ ...ok(), doc_type }] })).toThrow(ONLY_BEP_EIR);
    expect(() => validateDocTemplates({ templates: [{ ...ok(), name: "x".repeat(121) }] })).toThrow(/name is longer than 120/);
    expect(() => validateDocTemplates({ templates: [{ ...ok(), name: "  " }] })).toThrow(/needs a name/);
    expect(() => validateDocTemplates({ templates: [{ ...ok(), when_to_use: "x".repeat(401) }] })).toThrow(/when_to_use/);
    expect(() => validateDocTemplates({ templates: [{ ...ok(), variant: "huge" }] })).toThrow(/variant/);
  });
  it("sends every block through validateBlock and every binding through the known checks", () => {
    const t = ok();
    t.sections[0].blocks = [{ kind: "table", title: "T", data: { columns: [{ key: "a", label: "A", type: "weird" }], rows: [] } }];
    expect(() => validateDocTemplates({ templates: [t] })).toThrow(/type must be one of/);
    const u = ok();
    u.sections[0].blocks = [{ kind: "nonsense", title: "", data: {} }];
    expect(() => validateDocTemplates({ templates: [u] })).toThrow(/kind must be one of/);
    knowChecks(["cde.states", "loin.levels"]);
    try {
      const w = ok();
      w.sections[0].bindings = { checks: [{ id: "made.up" }] };
      expect(() => validateDocTemplates({ templates: [w] })).toThrow(/unknown check id 'made\.up'/);
    } finally { knowChecks(null); }
  });
  it("limits apply to templates too: a section's blocks and a table's rows", () => {
    const t = ok();
    t.sections[0].blocks = Array.from({ length: 61 }, () => ({ kind: "text", title: "", data: { markdown: "" } }));
    expect(() => validateDocTemplates({ templates: [t] })).toThrow(/at most 60 blocks/);
    const u = ok();
    u.sections[0].blocks = [{ kind: "table", title: "T", data: { columns: [{ key: "a", label: "A", type: "text" }], rows: Array.from({ length: 501 }, (_, i) => ({ id: `r${i}`, cells: {} })) } }];
    expect(() => validateDocTemplates({ templates: [u] })).toThrow(/at most 500 rows/);
  });
  it("is a known artefact kind with the same validator", () => {
    expect(KINDS).toContain("doc_templates");
    expect(() => validateArtefact("doc_templates", { templates: [ok()] })).not.toThrow();
    expect(() => validateArtefact("doc_templates", { templates: [{ ...ok(), doc_type: "TIDP" }] })).toThrow(ONLY_BEP_EIR);
  });
});

describe("templateFromDocument", () => {
  const doc = () => {
    const d = source();
    const roles = d.sections.find((s) => s.template_key === "roles-and-responsibilities");
    const people = roles.blocks.find((b) => b.kind === "table");
    people.data.rows = [{ id: "r1", group: null, cells: { function: "BIM manager", person: "a@x.com", team: "STR" } }];
    const matrix = roles.blocks.find((b) => b.kind === "matrix");
    matrix.data.rows = [{ id: "m1", label: "Walls", milestone: "S3", recipient: "Client", marks: Object.fromEntries(matrix.data.columns.slice(0, 1).map((c) => [c.key, "produces"])) }];
    roles.blocks[0].data.markdown = "We deliver.";
    d.sections.find((s) => s.template_key === "project-documents").blocks.find((b) => b.kind === "references").data.rows = [{ id: "p1", role: "protocol", title: "Info protocol", version: "2", sha: null, issuer: "Client", received: null, incorporated_in: [] }];
    d.sections.find((s) => s.template_key === "information-standard").blocks.find((b) => b.kind === "proposed_changes").data.changes = [{ field_key: "x", change: "added", detail: "d", reason: "r" }];
    return d;
  };
  it("structure only keeps headings, guidance, bound checks, kinds and order, columns, preset, fact labels, live filters, reference roles; drops rows and text", () => {
    const e = templateFromDocument(doc(), disk("bep-comprehensive"), { id: "a-b", name: "N" });
    const roles = e.sections.find((s) => s.key === "roles-and-responsibilities");
    expect(roles.blocks[0].data.markdown).toBe("");
    expect(roles.blocks[1].data.rows).toEqual([]);
    expect(roles.blocks[1].data.columns.map((c) => c.label)).toEqual(["Function", "Person", "Task team"]);
    expect(roles.blocks[2].data.rows).toEqual([]);
    expect(roles.blocks[2].data.preset).toBe("high_level");
    expect(roles.bindings.checks.map((c) => c.id)).toEqual(["roles.responsibility", "people.nominated", "roles.one_producer"]);
    const refs = e.sections.find((s) => s.key === "project-documents").blocks[1].data.rows;
    expect(refs).toEqual([expect.objectContaining({ role: "protocol", title: "", issuer: "" })]);
    expect(e.sections.find((s) => s.key === "information-standard").blocks.find((b) => b.kind === "proposed_changes").data.changes).toEqual([]);
    expect(e.starts.no_eir.blocks.length).toBeGreaterThan(0); // carried from the comprehensive template
    expect(() => validateDocTemplates({ templates: [e] })).not.toThrow();
  });
  it("with content keeps everything", () => {
    const e = templateFromDocument(doc(), null, { id: "a-b", name: "N", keep_content: true });
    const roles = e.sections.find((s) => s.key === "roles-and-responsibilities");
    expect(roles.blocks[0].data.markdown).toBe("We deliver.");
    expect(roles.blocks[1].data.rows).toHaveLength(1);
    expect(roles.blocks[2].data.rows).toHaveLength(1);
    expect(e.starts).toBeUndefined();
    expect(() => validateDocTemplates({ templates: [e] })).not.toThrow();
  });
  it("round trip: a document made from the office template has the same headings, guidance, kinds, order, titles, columns and bindings as its source", () => {
    const src = source(), e = entry(src);
    const [t] = officeTemplates(art(e));
    expect(t).toMatchObject({ template_id: "office-my-bep", version: 3, office: true, doc_type: "BEP", variant: "full", title: "Our BEP", when_to_use: "Every job", default: false });
    const made = instantiateTemplate(t, { title: "From office", actor: "a" });
    expect(made).toMatchObject({ template_id: "office-my-bep", template_version: 3, doc_type: "BEP", status: "wip" });
    expect(shape(made)).toEqual(shape(src));
  });
  it("keys: from the document's template key, else its heading; unique; and a section made by hand is fine", () => {
    const d = source();
    d.sections.push({ id: "x", heading: "17. Extra section", guidance: "", body: "", blocks: [{ id: "x.t0", kind: "text", title: "", data: { markdown: "" } }], bindings: {} });
    d.sections.push({ id: "y", heading: "17. Extra section", guidance: "", body: "", bindings: {} }); // no blocks: its body is one text block
    const keys = entry(d).sections.map((s) => s.key);
    expect(keys.slice(-2)).toEqual(["extra-section", "extra-section-2"]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(() => validateDocTemplates({ templates: [entry(d)] })).not.toThrow();
  });
});

describe("officeTemplates and ids", () => {
  it("a template list never throws: nothing, or a body that no longer validates, gives none", () => {
    expect(officeTemplates(null)).toEqual([]);
    expect(officeTemplates({ body: { templates: "no" }, version: 1 })).toEqual([]);
  });
  it("reads the version from a resolved artefact's ref", () => {
    expect(officeTemplates({ body: { templates: [entry(source())] }, ref: "doc_templates@7" })[0].version).toBe(7);
  });
  it("an id from a name: lower-case words, unique, always valid", () => {
    expect(templateIdFor("Our BEP — Stage 3!", new Set())).toBe("our-bep-stage-3");
    expect(templateIdFor("Our BEP", new Set(["our-bep"]))).toBe("our-bep-2");
    expect(templateIdFor("123", new Set())).toMatch(/^[a-z][a-z0-9-]{1,40}$/);
    expect(templateIdFor("???", new Set())).toBe("template");
  });
});

describe("putArtefact doc_templates: the office's standard, never a project's", () => {
  const mem = () => {
    const docs = new Map(), k = (s, p, d) => `${s}|${p}|${d}`;
    return {
      ensureProject: async (key) => ({ id: `uuid-${key}`, key, kind: key.startsWith("office") ? "office" : "project" }),
      docGet: async (s, p, d) => docs.get(k(s, p, d)) ?? null, docInsert: async (s, p, d, data) => { docs.set(k(s, p, d), data); }, docUpsert: async (s, p, d, data) => { docs.set(k(s, p, d), data); },
      audit: async () => {}, requireMinRole: async (key, min) => { if (globalThis.__role === "contributor") throw Object.assign(new Error(`this action requires the ${min} role`), { status: 403 }); },
      officeKeyOf: async (key) => (key.startsWith("office") ? null : "office1"),
      officeArtefact: async (key, kind) => { const p = docs.get(k("artefact", `uuid-${key}`, kind)); return p ? docs.get(k("artefact", `uuid-${key}`, `${kind}@${p.version}`)) ?? null : null; },
    };
  };
  it("an office lead installs it and a project inherits it; a project's own install is refused in words; a contributor is a 403", async () => {
    const { putArtefact, resolveArtefact } = await import("./artefact-store.mjs");
    const d = mem(), body = { templates: [entry(source())] };
    globalThis.__role = "contributor";
    try { await expect(putArtefact("office1", "doc_templates", body, { actor: "x" }, d)).rejects.toMatchObject({ status: 403 }); } finally { globalThis.__role = undefined; }
    await expect(putArtefact("proj-a", "doc_templates", body, { actor: "x" }, d)).rejects.toMatchObject({ status: 400, message: /belong to the office/ });
    const p = await putArtefact("office1", "doc_templates", body, { actor: "x" }, d);
    expect(p.version).toBe(1);
    const seen = await resolveArtefact("proj-a", "doc_templates", d);
    expect([seen.source, seen.ref]).toEqual(["office", "doc_templates@1"]);
    expect(officeTemplates(seen)[0]).toMatchObject({ template_id: "office-my-bep", version: 1 });
  });
  it("a template that no longer validates is left out alone: the others are still listed", () => {
    const good = entry(source()), gone = { ...good, id: "old-one", sections: [{ ...good.sections[0], bindings: { checks: [{ id: "check.that.left", params: {} }] } }] };
    expect(officeTemplates({ body: { templates: [gone, good] }, version: 4 }).map((t) => t.template_id)).toEqual(["office-my-bep"]);
    expect(officeTemplates({ body: { templates: "nonsense" }, version: 4 })).toEqual([]);
  });
  it("a direct install names only checks that exist, even when nothing else has loaded the registry", async () => {
    const { putArtefact } = await import("./artefact-store.mjs");
    const good = entry(source()), odd = { ...good, sections: [{ ...good.sections[0], bindings: { checks: [{ id: "not.a.check", params: {} }] } }] };
    await expect(putArtefact("office1", "doc_templates", { templates: [odd] }, { actor: "x" }, mem())).rejects.toMatchObject({ status: 400, message: /unknown check id 'not.a.check'/ });
  });
});
