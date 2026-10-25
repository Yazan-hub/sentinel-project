import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("../setups/bridge-fetch", () => ({ bfetch }));
vi.mock("../setups/ask", () => ({ askText: vi.fn(async () => null), askYesNo: vi.fn(async () => true) }));

// @ts-ignore the bridge store is plain JS
import { validateArtefact } from "../../bridge/artefact-store.mjs";
import { namingFromText } from "../sentinel-core/naming-from-text";
import { bumpMinor, diffLines, makeNamingRule, installNamingRule, namingEditor, namingProblems, toNamingArtefact } from "./naming-block";
import { editPane, EDITORS, TEXT_ACTIONS } from "./block-editors";
import { click, fakeDocument, findAll, fire, textOf } from "./fake-dom";

const f = (key: string, label: string, o: { enum?: string[]; pattern?: string } = {}) => ({ key, label, pattern: o.pattern ?? null, enum: o.enum ?? [], placeholders: [] as string[], description: "" });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("namingProblems", () => {
  it("says each problem in words, in order", () => {
    expect(namingProblems({ separator: "--", enforce: "reject", fields: [] })).toEqual(["The separator must be one character.", "Add at least one field."]);
    expect(namingProblems({ separator: "_", enforce: "reject", fields: [f("project", "Project", { enum: ["SNW"] }), f("role", "", { enum: ["A"] }), f("number", "Number"), f("role", "Role", { pattern: "([" })] }))
      .toEqual(["Field 2 has no label.", "Field 3 has no allowed values and no pattern; add one.", expect.stringMatching(/^Field 4's pattern is not valid: .+\.$/), "Two fields use the key 'role'."]);
  });
});
describe("namingProblems edge", () => {
  it("two blank keys are not 'the same key'", () => {
    expect(namingProblems({ separator: "_", enforce: "reject", fields: [f("", "A", { enum: ["x"] }), f("", "B", { enum: ["y"] })] })).toEqual([]);
  });
});
describe("toNamingArtefact", () => {
  it("passes the bridge's naming artefact rules for Snowdon's rule", () => {
    const data = namingFromText("`SNW_<role>_<number>`\n\n| Field | Values |\n|---|---|\n| Role | A, S |\n| Number | 0001 upwards |")!;
    const art = toNamingArtefact(data, { title: "SNW container naming", standard_key: "snowdon-lifecycle-naming", semver: "1.0.0" });
    expect(() => validateArtefact("naming", art)).not.toThrow();
    expect(art).toMatchObject({ title: "SNW container naming", standard_key: "snowdon-lifecycle-naming", semver: "1.0.0", separator: "_", enforce: "reject" });
    expect(art.fields).toEqual([{ key: "project", label: "Project", enum: ["SNW"] }, { key: "role", label: "Role", enum: ["A", "S"] }, { key: "number", label: "Number", pattern: "^[0-9]{4}$" }]);
  });
});
describe("bumpMinor and diffLines", () => {
  it("bumps x.y.z to the next minor and starts at 1.0.0", () => {
    expect([bumpMinor("1.2.3"), bumpMinor("2.0.9"), bumpMinor(""), bumpMinor(undefined), bumpMinor("v1")]).toEqual(["1.3.0", "2.1.0", "1.0.0", "1.0.0", "1.0.0"]);
  });
  it("says removals first and an identical rule plainly", () => {
    expect(diffLines({ added: [{ key: "role", label: "Role" }], removed: [{ key: "zone", label: "Zone" }], changed: [], header: ["separator '-' → '_'"] }, false))
      .toEqual(["Removes 1 field(s): Zone. Names built with them will stop conforming.", "separator '-' → '_'", "Adds Role (role)."]);
    expect(diffLines({ added: [], removed: [], changed: [], header: [] }, true)).toEqual(["Identical to the rule in force; nothing to install."]);
  });
  it("lists changed fields with their changes", () => {
    expect(diffLines({ added: [], removed: [], changed: [{ key: "role", label: "Role", changes: ["label A → B", "enum +X"] }], header: [] }, false)).toEqual(["Changes Role: label A → B; enum +X."]);
  });
});

// ---- the editor, the text action and the install, through the fake document ----
const SNW = "`SNW_<role>_<number>`\n\n| Field | Values |\n|---|---|\n| Role | A, S |\n| Number | 0001 upwards |";
const dataOf = () => namingFromText(SNW)!;
const nblock = (data = dataOf()) => ({ id: "n1", kind: "naming", title: "Container naming", data }) as any;
function ctxWith(o: { ws?: Record<string, unknown>; canEdit?: boolean; canGovern?: boolean; key?: string } = {}) {
  const st = { key: o.key ?? "snowdon-lifecycle", doc: { id: "d1", title: "SNW BEP", sections: [] }, versions: [], comments: [], ex: null, role: o.canGovern === false ? "contributor" : "lead", me: "lead@x", problems: [], message: "", viewing: null, respondsTo: null };
  const ctx = { st, doc: fakeDocument(), base: "http://b", canEdit: o.canEdit ?? true, canGovern: o.canGovern ?? true, focused: null, focus: vi.fn(), show: vi.fn(), refresh: vi.fn(), openDoc: vi.fn(),
    ws: { state: vi.fn(() => st), write: vi.fn(async () => null), post: vi.fn(), get: vi.fn(), rescore: vi.fn(), open: vi.fn(), reload: vi.fn(), viewVersion: vi.fn(), ...o.ws } } as any;
  return { ctx, st: st as any };
}
const button = (el: HTMLElement, label: string) => findAll(el, "button").find((b) => textOf(b) === label) as HTMLButtonElement | undefined;
const field = (el: HTMLElement, name: string) => findAll(el, "input").filter((i) => (i as any).dataset.field === name) as HTMLInputElement[];
const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const inForceBody = { title: "Old rule", standard_key: "snw-naming", semver: "1.2.0", separator: "_", enforce: "reject", fields: [{ key: "project", label: "Project", enum: ["SNW"] }, { key: "zone", label: "Zone", enum: ["Z1"] }] };

describe("registration", () => {
  it("the naming editor and the text action are registered", () => {
    expect(EDITORS.naming).toBe(namingEditor);
    expect(TEXT_ACTIONS).toContain(makeNamingRule);
  });
});

describe("namingEditor", () => {
  it("shows the separator, the enforce choice and one row per field, and gives back the data typed", () => {
    const { ctx } = ctxWith();
    const e = namingEditor(nblock(), ctx, "s1");
    expect(field(e.el, "separator")[0].value).toBe("_");
    expect(field(e.el, "key").map((i) => i.value)).toEqual(["project", "role", "number"]);
    expect(field(e.el, "values")[1].value).toBe("A, S");
    expect(field(e.el, "pattern")[2].value).toBe("^[0-9]{4}$");
    const sel = findAll(e.el, "select")[0] as any;
    expect(sel.value).toBe("reject");
    expect(findAll(sel, "option").map(textOf)).toEqual(["Refuse names that do not match", "Warn", "Off"]);
    field(e.el, "values")[1].value = "A, S, , M ";
    fire(field(e.el, "values")[1], "input");
    field(e.el, "separator")[0].value = "-"; fire(field(e.el, "separator")[0], "input");
    sel.value = "warn"; fire(sel, "change");
    const v = e.value();
    expect(v.title).toBe("Container naming");
    expect(v.data).toMatchObject({ separator: "-", enforce: "warn" });
    expect((v.data as any).fields[1]).toEqual({ key: "role", label: "Role", pattern: null, enum: ["A", "S", "M"], placeholders: [], description: "" });
    expect(dataOf().separator).toBe("_"); // the stored block was not changed
  });
  it("lists the problems live and gates Save only on what the bridge refuses", () => {
    const { ctx } = ctxWith();
    const e = namingEditor(nblock(), ctx, "s1");
    const changed = vi.fn(); e.onChange!(changed);
    expect(e.problems!()).toEqual([]);
    click(button(e.el, "Add field")!);
    expect(changed).toHaveBeenCalled();
    expect(textOf(e.el)).toContain("Field 4 has no label.");
    expect(textOf(e.el)).toContain("Field 4 has no allowed values and no pattern; add one.");
    expect(e.problems!()).toEqual(["Field 4 has no key."]); // a blank key is refused by the bridge; the rest saves as work in progress
    field(e.el, "key")[3].value = "zone"; fire(field(e.el, "key")[3], "input");
    expect(e.problems!()).toEqual([]);
    field(e.el, "separator")[0].value = "--"; fire(field(e.el, "separator")[0], "input");
    expect(e.problems!()).toEqual(["The separator must be one character."]);
    expect(textOf(e.el)).toContain("The separator must be one character.");
  });
  it("removes a field", () => {
    const { ctx } = ctxWith();
    const e = namingEditor(nblock(), ctx, "s1");
    click(button(findAll(e.el, "tr")[2] as any, "Remove")!);
    expect((e.value().data as any).fields.map((x: any) => x.key)).toEqual(["project", "number"]);
  });
});

describe("makeNamingRule", () => {
  const textBlock = { id: "t1", kind: "text", title: "", data: { markdown: SNW } } as any;
  const area = (md: string) => ({ value: md }) as HTMLTextAreaElement;
  it("shows nothing to a reader", () => {
    expect(makeNamingRule(textBlock, "s1", ctxWith({ canEdit: false }).ctx, area(SNW))).toBeNull();
  });
  it("says so when the text holds no naming rule, and writes nothing", () => {
    const { ctx } = ctxWith();
    const el = makeNamingRule(textBlock, "s1", ctx, area("Just prose."))!;
    click(button(el, "Make this a naming rule")!);
    expect(textOf(el)).toContain("No naming table or json block found in this text.");
    expect(ctx.ws.write).not.toHaveBeenCalled();
  });
  it("shows the proposal, marked not saved, and adds it after this block on request", async () => {
    const fresh = { id: "d1", sections: [] };
    const { ctx } = ctxWith({ ws: { write: vi.fn(async () => fresh) } });
    ctx.sectionApplied = vi.fn(async () => {});
    const el = makeNamingRule(textBlock, "s/1", ctx, area(SNW))!;
    click(button(el, "Make this a naming rule")!);
    expect(textOf(el)).toContain("Not saved yet");
    expect(textOf(el)).toContain("Naming rule: project_role_number");
    expect(ctx.ws.write).not.toHaveBeenCalled();
    click(button(el, "Add as a naming block")!);
    await flush();
    expect(ctx.ws.write).toHaveBeenCalledWith("POST", "/section/s%2F1/blocks", { kind: "naming", title: "Container naming", data: dataOf(), after: "t1" });
    expect(ctx.sectionApplied).toHaveBeenCalledWith("s/1", fresh);
  });
  it("a refused add shows the bridge's words; a stale answer shows nothing", async () => {
    const { ctx, st } = ctxWith();
    st.message = "Only a lead can do that. Nothing was saved.";
    const el = makeNamingRule(textBlock, "s1", ctx, area(SNW))!;
    click(button(el, "Make this a naming rule")!); click(button(el, "Add as a naming block")!); await flush();
    expect(textOf(el)).toContain("Only a lead can do that. Nothing was saved.");
    const b = ctxWith({ key: "k1" });
    const el2 = makeNamingRule(textBlock, "s1", b.ctx, area(SNW))!;
    click(button(el2, "Make this a naming rule")!);
    b.ctx.ws.write = vi.fn(async () => { b.ctx.ws.state = vi.fn(() => ({ ...b.st, key: "k2" })); return null; }); // the project switched: the page's snapshot keeps k1
    click(button(el2, "Add as a naming block")!); await flush();
    expect(textOf(el2)).not.toContain("Nothing was saved");
  });
});

describe("installNamingRule", () => {
  beforeEach(() => bfetch.mockReset());
  const getRule = (body: unknown, sha = "sha-1") => res(200, { body, ref: "naming@3", source: "project", sha256: sha });
  const mount = (c = ctxWith()) => ({ ...c, el: installNamingRule(nblock(), c.ctx, "s1")! });
  it("is for governors only, and disabled with the problems listed while the block has any", () => {
    expect(installNamingRule(nblock(), ctxWith({ canGovern: false }).ctx, "s1")).toBeNull();
    const el = installNamingRule(nblock({ separator: "--", enforce: "reject", fields: [] }), ctxWith().ctx, "s1")!;
    expect(button(el, "Install as the project's naming rule")!.disabled).toBe(true);
    expect(textOf(el)).toContain("The separator must be one character.");
  });
  it("reads the rule in force, prefills the form, shows the difference, and installs with If-Match", async () => {
    bfetch.mockResolvedValueOnce(getRule(inForceBody)).mockResolvedValueOnce(res(201, { kind: "naming", version: 4, sha256: "n" }));
    const { ctx, el } = mount();
    click(button(el, "Install as the project's naming rule")!); await flush();
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/snowdon-lifecycle/artefacts/naming");
    expect(field(el, "title")[0].value).toBe("Old rule");
    expect(field(el, "standard_key")[0].value).toBe("snw-naming");
    expect(field(el, "semver")[0].value).toBe("1.3.0");
    const t = textOf(el);
    expect(t).toContain("naming@3 · project · sha-1…");
    expect(t).toContain("Removes 1 field(s): Zone. Names built with them will stop conforming.");
    expect(t).toContain("Adds Role (role).");
    click(button(el, "Install on this project")!); await flush();
    const [url, init] = bfetch.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("http://b/cde/snowdon-lifecycle/artefacts/naming?actor=lead%40x");
    expect((init.headers as any)["If-Match"]).toBe('"sha-1"');
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ title: "Old rule", standard_key: "snw-naming", semver: "1.3.0", separator: "_", source: { document_id: "d1", section: "s1", block: "n1" } });
    expect(() => validateArtefact("naming", (({ source, ...r }) => r)(sent))).not.toThrow();
    expect(textOf(el)).toContain("Installed naming@4 on snowdon-lifecycle.");
    expect(ctx.ws.write).not.toHaveBeenCalled();
  });
  it("with no rule in force the form starts from the document and project, sends If-Match none, and every field is added", async () => {
    bfetch.mockResolvedValueOnce(res(404, { reason: "not_installed" })).mockResolvedValueOnce(res(201, { kind: "naming", version: 1, sha256: "n" }));
    const { el } = mount();
    click(button(el, "Install as the project's naming rule")!); await flush();
    expect(field(el, "title")[0].value).toBe("SNW BEP container naming");
    expect(field(el, "standard_key")[0].value).toBe("snowdon-lifecycle-naming");
    expect(field(el, "semver")[0].value).toBe("1.0.0");
    expect(textOf(el)).toContain("no naming rule in force");
    expect(textOf(el)).toContain("Adds Number (number).");
    click(button(el, "Install on this project")!); await flush();
    expect(((bfetch.mock.calls[1] as any)[1].headers as any)["If-Match"]).toBe('"none"');
    expect(textOf(el)).toContain("Installed naming@1 on snowdon-lifecycle.");
  });
  it("keeps the settings of the rule in force that the block does not model, and says so", async () => {
    const body = { ...inForceBody, strip_extensions: [".ifc", ".rvt"], note: "x" };
    bfetch.mockResolvedValueOnce(getRule(body)).mockResolvedValueOnce(res(201, { kind: "naming", version: 4, sha256: "n" }));
    const { el } = mount();
    click(button(el, "Install as the project's naming rule")!); await flush();
    expect(textOf(el)).toContain("Keeps file extensions removed before a name is checked (.ifc, .rvt) from the rule in force.");
    expect(textOf(el)).toContain("Keeps another setting of the rule in force (note).");
    expect(textOf(el)).not.toContain("strip_extensions");
    click(button(el, "Install on this project")!); await flush();
    const sent = JSON.parse(((bfetch.mock.calls[1] as any)[1] as RequestInit).body as string);
    expect(sent).toMatchObject({ strip_extensions: [".ifc", ".rvt"], note: "x", separator: "_", source: { block: "n1" } });
    expect(sent.fields.map((x: any) => x.key)).toEqual(["project", "role", "number"]); // modelled keys come from the block
  });
  it("after a 412 the extras come from the rule re-read", async () => {
    bfetch.mockResolvedValueOnce(getRule({ ...inForceBody, strip_extensions: [".ifc"] }))
      .mockResolvedValueOnce(res(412, { message: "changed" }))
      .mockResolvedValueOnce(getRule({ ...inForceBody, strip_extensions: [".rvt"] }, "sha-2"))
      .mockResolvedValueOnce(res(201, { kind: "naming", version: 4, sha256: "n" }));
    const { el } = mount();
    click(button(el, "Install as the project's naming rule")!); await flush();
    click(button(el, "Install on this project")!); await flush();
    expect(textOf(el)).toContain("Keeps file extensions removed before a name is checked (.rvt) from the rule in force.");
    click(button(el, "Install on this project")!); await flush();
    expect(JSON.parse(((bfetch.mock.calls[3] as any)[1] as RequestInit).body as string).strip_extensions).toEqual([".rvt"]);
  });
  it("a failed read shows one message, however often it is retried", async () => {
    bfetch.mockResolvedValue(res(500, { message: "boom" }));
    const { el } = mount();
    for (let i = 0; i < 3; i++) { click(button(el, "Install as the project's naming rule")!); await flush(); }
    expect(textOf(el).split("boom")).toHaveLength(2);
  });
  it("an identical rule has nothing to install", async () => {
    const same = toNamingArtefact(dataOf(), { title: "t", standard_key: "k", semver: "1.0.0" });
    bfetch.mockResolvedValueOnce(getRule(same));
    const { el } = mount();
    click(button(el, "Install as the project's naming rule")!); await flush();
    expect(textOf(el)).toContain("Identical to the rule in force; nothing to install.");
    expect(button(el, "Install on this project")!.disabled).toBe(true);
  });
  it("a 412 re-reads, re-diffs and installs nothing; the next click carries the newer sha", async () => {
    bfetch.mockResolvedValueOnce(getRule(inForceBody))
      .mockResolvedValueOnce(res(412, { message: "naming changed by lead@x at 2026-10-25 10:00 UTC — reload to see it; nothing was saved" }))
      .mockResolvedValueOnce(getRule({ ...inForceBody, fields: [{ key: "project", label: "Project", enum: ["SNW"] }] }, "sha-2"));
    const { el } = mount();
    click(button(el, "Install as the project's naming rule")!); await flush();
    click(button(el, "Install on this project")!); await flush();
    const t = textOf(el);
    expect(t).toContain("The naming rule in force changed while you looked; here is the new difference. Nothing was installed.");
    expect(t).not.toContain("Removes 1 field(s)");
    expect(t).not.toContain("Installed naming@");
    expect(bfetch).toHaveBeenCalledTimes(3);
    bfetch.mockResolvedValueOnce(res(201, { kind: "naming", version: 4, sha256: "n" }));
    click(button(el, "Install on this project")!); await flush();
    expect(((bfetch.mock.calls[3] as any)[1].headers as any)["If-Match"]).toBe('"sha-2"');
  });
  it("another refusal shows the bridge's words", async () => {
    bfetch.mockResolvedValueOnce(getRule(inForceBody)).mockResolvedValueOnce(res(403, { message: "lead or owner only" }));
    const { el } = mount();
    click(button(el, "Install as the project's naming rule")!); await flush();
    click(button(el, "Install on this project")!); await flush();
    expect(textOf(el)).toContain("lead or owner only");
  });
  it("a project switch during the read, the install or the re-read leaves the page alone", async () => {
    let release!: () => void;
    bfetch.mockImplementationOnce(() => new Promise((r) => { release = () => r(getRule(inForceBody)); }));
    const a = mount();
    click(button(a.el, "Install as the project's naming rule")!);
    a.st.key = "other"; release(); await flush();
    expect(findAll(a.el, "input")).toHaveLength(0);
    bfetch.mockReset();
    const m = mount();
    bfetch.mockResolvedValueOnce(getRule(inForceBody)).mockImplementationOnce(async () => { m.st.key = "other"; return res(201, { kind: "naming", version: 4, sha256: "n" }); });
    click(button(m.el, "Install as the project's naming rule")!); await flush();
    click(button(m.el, "Install on this project")!); await flush();
    expect(textOf(m.el)).not.toContain("Installed naming@");
    bfetch.mockReset();
    const r = mount();
    bfetch.mockResolvedValueOnce(getRule(inForceBody)).mockResolvedValueOnce(res(412, { message: "changed" })).mockImplementationOnce(async () => { r.st.key = "other"; return getRule(inForceBody, "sha-3"); });
    click(button(r.el, "Install as the project's naming rule")!); await flush();
    click(button(r.el, "Install on this project")!); await flush();
    expect(textOf(r.el)).not.toContain("changed while you looked");
  });
});

describe("the closed naming block in the edit view", () => {
  it("shows the install control to a lead and not to a contributor", () => {
    const row = { id: "d1", doc_type: "BEP", title: "T", status: "wip", stage: "pre_appointment", suitability: "S0", responds_to: null, responds_to_version: null, template_id: null, template_version: null, updated_at: "t1",
      sections: [{ id: "s1", heading: "S", guidance: "", body: "", state: "wip", owner: null, bindings: {}, blocks: [nblock()] }] };
    const lead = ctxWith(); lead.st.doc = row;
    expect(button(editPane(lead.ctx), "Install as the project's naming rule")).toBeDefined();
    const contributor = ctxWith({ canGovern: false }); contributor.st.doc = row;
    expect(button(editPane(contributor.ctx), "Install as the project's naming rule")).toBeUndefined();
  });
  it("F4: by role on any status: a lead is offered the install in the read-only edit view, a contributor is not", () => {
    const row = { id: "d1", doc_type: "BEP", title: "T", status: "published", stage: "pre_appointment", suitability: "S0", responds_to: null, responds_to_version: null, template_id: null, template_version: null, updated_at: "t1",
      sections: [{ id: "s1", heading: "S", guidance: "", body: "", state: "wip", owner: null, bindings: {}, blocks: [nblock()] }] };
    const lead = ctxWith({ canEdit: false, canGovern: false }); lead.st.role = "lead"; lead.st.doc = row;
    expect(button(editPane(lead.ctx), "Install as the project's naming rule")).toBeDefined();
    const contributor = ctxWith({ canEdit: false, canGovern: false }); contributor.st.doc = row;
    expect(button(editPane(contributor.ctx), "Install as the project's naming rule")).toBeUndefined();
  });
  it("Make this a naming rule adds the block beside the text and keeps the text being edited", async () => {
    const t = { id: "t1", kind: "text", title: "", data: { markdown: SNW } };
    const mk = (blocks: unknown[]) => ({ id: "d1", doc_type: "BEP", title: "T", status: "wip", stage: "pre_appointment", suitability: "S0", responds_to: null, responds_to_version: null, template_id: null, template_version: null, updated_at: "t2",
      sections: [{ id: "s1", heading: "S", guidance: "", body: "", state: "wip", owner: null, bindings: {}, blocks }] });
    const { ctx, st } = ctxWith({ ws: { write: vi.fn(async () => mk([t, nblock()])) } });
    st.doc = mk([t]);
    const root = editPane(ctx);
    const shells = () => findAll(root, "div").filter((e) => (e as any).dataset.blockShell);
    expect(shells()).toHaveLength(1);
    click(button(root, "Edit")!);
    (findAll(root, "textarea")[0] as any).value = SNW + " more, not saved";
    click(button(root, "Make this a naming rule")!); click(button(root, "Add as a naming block")!); await flush();
    expect(ctx.ws.write).toHaveBeenCalledWith("POST", "/section/s1/blocks", { kind: "naming", title: "Container naming", data: dataOf(), after: "t1" });
    expect(shells()).toHaveLength(2);
    expect((findAll(root, "textarea")[0] as any).value).toBe(SNW + " more, not saved");
  });
});
