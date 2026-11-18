import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./bridge-fetch", () => ({ bfetch: vi.fn() }));
vi.mock("./ask", () => ({ askText: vi.fn(async () => null), askYesNo: vi.fn(async () => true) }));
vi.mock("./active-ruleset", () => ({ artefactInForce: vi.fn(), installArtefact: vi.fn(async () => ({ kind: "doc_templates", version: 3, sha256: "new" })) }));

import { bfetch } from "./bridge-fetch";
import { askYesNo } from "./ask";
import { artefactInForce, installArtefact } from "./active-ruleset";
import { readFileSync } from "node:fs";
import { createLine, creatable, TIDP_MOVED, mountTemplates, templateForm, templateId, templateLine, type OfficeTemplate } from "./template-form";
import { click, fakeDocument, findAll, fire, textOf } from "../workspace/fake-dom";

const tick = () => new Promise((r) => setTimeout(r, 0));
const flush = async () => { for (let i = 0; i < 6; i++) await tick(); };
const registry = { checks: [{ id: "roles.responsibility", label: "Responsibilities", params_schema: {} }, { id: "docs.suitability", label: "Document suitability", params_schema: { allowed: { type: "string[]", default: ["S1", "S2"] } } }],
  planned: [{ id: "federation.breakdown", label: "Federation breakdown", reason: "x" }] };
const tpl: OfficeTemplate = { id: "our-bep", doc_type: "BEP", name: "Our BEP", when_to_use: "For small jobs.", variant: "full", starts: { no_eir: {} },
  sections: [{ key: "intro", heading: "1. Intro", guidance: "Say why.", bindings: { checks: [{ id: "roles.responsibility" }] },
    blocks: [{ kind: "text", title: "", data: { markdown: "Hello" } }, { kind: "table", title: "People", data: { columns: [{ key: "who", label: "Who", type: "text", choices: [], choices_from: null }], rows: [], group_by_team: false } }] },
  { key: "two", heading: "2. Two", guidance: "", bindings: { checks: [] }, blocks: [] }] };
const o = (d: Document) => ({ base: "http://b", officeKey: "office", doc: d, who: async () => "lead@x" });
const by = (el: HTMLElement, tag: string, name: string) => findAll(el, tag).filter((x) => (x as any).dataset.field === name) as HTMLInputElement[];
const button = (el: HTMLElement, label: string) => findAll(el, "button").filter((b) => textOf(b) === label);
const setv = (el: any, v: string) => { el.value = v; fire(el, "input"); fire(el, "change"); };

beforeEach(() => {
  vi.mocked(bfetch).mockImplementation(async (u: any) => ({ ok: true, status: 200, json: async () => (String(u).endsWith("/bimdocs/checks") ? registry : []) }) as any);
  vi.mocked(artefactInForce).mockResolvedValue({ body: { templates: [tpl] }, sha256: "old", ref: "doc_templates@2", source: "project" } as any);
  vi.mocked(installArtefact).mockClear();
});

describe("templateLine and templateId", () => {
  it("name · type · variant · sections; no variant says none", () => {
    expect(templateLine(tpl)).toBe("Our BEP · BEP · Full · 2 sections");
    expect(templateLine({ ...tpl, variant: null, sections: [tpl.sections[0]] })).toBe("Our BEP · BEP · 1 section");
  });
  it("an id the bridge accepts, unique", () => {
    for (const n of ["Our BEP", "2nd try", "!!!", "x".repeat(80)]) expect(templateId(n, [])).toMatch(/^[a-z][a-z0-9-]{1,40}$/);
    expect(templateId("Our BEP", ["our-bep"])).toBe("our-bep-2");
  });
});

describe("the list", () => {
  it("one line per template with its when-to-use text, Edit…, Remove and + New template", async () => {
    const d = fakeDocument(), host = d.createElement("div");
    await mountTemplates(host, o(d)); await flush();
    expect(artefactInForce).toHaveBeenCalledWith("http://b", "office", "doc_templates");
    expect(textOf(host)).toContain("Our BEP · BEP · Full · 2 sections");
    expect(textOf(host)).toContain("For small jobs.");
    for (const l of ["Edit…", "Remove", "+ New template"]) expect(button(host, l)).toHaveLength(1);
    expect(textOf(host)).not.toMatch(/\{|\[object|"id"/);
  });
  it("Remove asks, then installs the artefact without it, with If-Match", async () => {
    const d = fakeDocument(), host = d.createElement("div");
    await mountTemplates(host, o(d)); await flush();
    click(button(host, "Remove")[0]); await flush();
    expect(askYesNo).toHaveBeenCalled();
    expect(installArtefact).toHaveBeenCalledWith("http://b", "office", "doc_templates", expect.objectContaining({ templates: [] }), "lead@x", "old");
    expect(textOf(host)).toContain('Removed "Our BEP" (version 3).');
  });
});

describe("the form", () => {
  it("covers every field: name, when to use, type, variant, then per section heading, guidance, move, remove, checks and blocks", async () => {
    const d = fakeDocument(), f = await templateForm(tpl, o(d));
    expect(by(f.el, "input", "name")[0].value).toBe("Our BEP");
    expect(by(f.el, "textarea", "when_to_use")[0].value).toBe("For small jobs.");
    expect(findAll(f.el, "select").map((s) => (s as any).value).slice(0, 2)).toEqual(["BEP", "full"]);
    expect(by(f.el, "input", "heading").map((i) => i.value)).toEqual(["1. Intro", "2. Two"]);
    expect(by(f.el, "textarea", "guidance")[0].value).toBe("Say why.");
    for (const l of ["Move up", "Move down", "Remove", "Add block", "Add section"]) expect(button(f.el, l).length).toBeGreaterThan(0);
    const ticks = findAll(f.el, "input").filter((i) => (i as any).type === "checkbox" && (i as any).dataset.check);
    expect(ticks.map((t) => (t as any).dataset.check)).toContain("roles.responsibility");
    expect(textOf(f.el)).toContain("Federation breakdown (not checkable yet)");
    expect(textOf(f.el)).toContain("Text"); // the blocks are named by kind, with their own editors
    expect(f.value()).toEqual(tpl); // nothing edited: the template comes back as it was, starts kept
  });
  it("ticking a check shows its settings as boxes (a list as commas) and saves them as the right type", async () => {
    const d = fakeDocument(), f = await templateForm(tpl, o(d));
    const tick = findAll(f.el, "input").find((i) => (i as any).dataset.check === "docs.suitability") as any;
    tick.checked = true; fire(tick, "change");
    const param = findAll(f.el, "input").find((i) => (i as any).dataset.param === "docs.suitability.allowed") as any;
    expect(param.value).toBe("S1, S2");
    setv(param, "S3, S4");
    expect(f.value().sections[0].bindings.checks).toContainEqual({ id: "docs.suitability", params: { allowed: ["S3", "S4"] } });
  });
  it("edits a heading, moves and removes a section, adds a block and a section", async () => {
    const d = fakeDocument(), f = await templateForm(tpl, o(d));
    setv(by(f.el, "input", "heading")[0], "1. Changed");
    click(button(f.el, "Move down")[0]);
    expect(f.value().sections.map((s) => s.heading)).toEqual(["2. Two", "1. Changed"]);
    click(button(f.el, "Add section")[0]);
    expect(f.value().sections).toHaveLength(3);
    expect(f.problems()).toContain("Section 3 has no heading.");
    const sel = findAll(f.el, "select").find((s) => findAll(s, "option").some((x) => textOf(x) === "Information needed, LOIN"))!;
    (sel as any).value = "loin";
    click(button(f.el, "Add block")[0]);
    expect((f.value().sections[0].blocks as any[]).slice(-1)[0]).toMatchObject({ kind: "loin", data: { rows: [] } });
    click(button(f.el, "Remove")[0]); await flush(); // the first section's own Remove
    expect(f.value().sections).toHaveLength(2);
  });
  it("a block keeps what was typed in its own editor", async () => {
    const d = fakeDocument(), f = await templateForm(tpl, o(d));
    const area = findAll(f.el, "textarea").find((a) => (a as any).value === "Hello")!;
    setv(area, "Changed text");
    expect(f.value().sections[0].blocks[0]).toEqual({ kind: "text", title: "", data: { markdown: "Changed text" } });
  });
  it("problems in words: no name, no sections, a section with no heading", async () => {
    const d = fakeDocument(), f = await templateForm(null, o(d));
    expect(f.problems()).toEqual(["Give the template a name.", "Add at least one section."]);
  });
});

describe("saving", () => {
  it("+ New template then Save installs the artefact with the new template added, on the sha it was read from", async () => {
    const d = fakeDocument(), host = d.createElement("div");
    await mountTemplates(host, o(d)); await flush();
    click(button(host, "+ New template")[0]); await flush();
    setv(by(host, "input", "name")[0], "Fresh one");
    click(button(host, "Add section")[0]);
    setv(by(host, "input", "heading")[0], "1. Start");
    click(button(host, "Save the template")[0]); await flush();
    const body = vi.mocked(installArtefact).mock.calls[0][3] as { templates: OfficeTemplate[] };
    expect(body.templates.map((t) => t.id)).toEqual(["our-bep", "fresh-one"]);
    expect(body.templates[1]).toMatchObject({ name: "Fresh one", doc_type: "BEP", variant: null, sections: [{ heading: "1. Start", blocks: [] }] });
    expect(vi.mocked(installArtefact).mock.calls[0][5]).toBe("old");
    expect(textOf(host)).toContain('Saved "Fresh one" (version 3).');
  });
  it("a refusal shows the bridge's words and keeps the form", async () => {
    vi.mocked(installArtefact).mockRejectedValueOnce(new Error("Only a lead of the office saves an office template."));
    const d = fakeDocument(), host = d.createElement("div");
    await mountTemplates(host, o(d)); await flush();
    click(button(host, "Edit…")[0]); await flush();
    click(button(host, "Save the template")[0]); await flush();
    expect(textOf(host)).toContain("Not saved: Only a lead of the office saves an office template.");
    expect(by(host, "input", "name")).toHaveLength(1);
  });
  it("an edit replaces that template and keeps its id and its start text", async () => {
    const d = fakeDocument(), host = d.createElement("div");
    await mountTemplates(host, o(d)); await flush();
    click(button(host, "Edit…")[0]); await flush();
    setv(by(host, "input", "name")[0], "Renamed");
    click(button(host, "Save the template")[0]); await flush();
    const body = vi.mocked(installArtefact).mock.calls[0][3] as { templates: OfficeTemplate[] };
    expect(body.templates).toHaveLength(1);
    expect(body.templates[0]).toMatchObject({ id: "our-bep", name: "Renamed", starts: { no_eir: {} } });
  });
});

describe("the start picker", () => {
  it("lists an office template as Create BEP — name (office template, n sections), a shipped one without the note", () => {
    expect(createLine({ template_id: "office-our-bep", doc_type: "BEP", name: "Our BEP", sections: 5 })).toBe("Create BEP — Our BEP (office template, 5 sections)");
    expect(createLine({ template_id: "bep-comprehensive", doc_type: "BEP", title: "BIM Execution Plan", sections: 14 })).toBe("Create BEP — BIM Execution Plan (14 sections)");
  });
  it("the Documents panel reads the project's list and posts the template id as listed; the office settings mount the templates", () => {
    const panel = readFileSync(new URL("./docs-panel.ts", import.meta.url), "utf8");
    expect(panel).toContain("/templates`)");
    expect(panel).toContain("template_id: t.template_id");
    expect(readFileSync(new URL("./project-settings-panel.ts", import.meta.url), "utf8")).toContain("mountTemplates(host,");
  });
});

describe("F-RUN-6: + New document does not offer a TIDP", () => {
  it("drops the TIDP templates and says where task team plans are made", () => {
    const list = [{ template_id: "bep", doc_type: "BEP", sections: 1 }, { template_id: "tidp", doc_type: "TIDP", sections: 1 }, { template_id: "t2", doc_type: "tidp", sections: 1 }];
    expect(creatable(list).map((t) => t.template_id)).toEqual(["bep"]);
    expect(TIDP_MOVED).toContain("Documents ▸ Delivery plan ▸ By task team");
  });
});
