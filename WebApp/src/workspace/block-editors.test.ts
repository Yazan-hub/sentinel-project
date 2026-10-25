import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../setups/bridge-fetch", () => ({ bfetch: vi.fn(async () => { throw new Error("offline"); }) }));
vi.mock("../setups/ask", () => ({ askText: vi.fn(async () => null), askYesNo: vi.fn(async () => true) }));

import { askYesNo } from "../setups/ask";
import { ADDABLE_KINDS, blockPath, editPane, guidanceOpen } from "./block-editors";
import { fakeDocument, findAll, textOf, click, fire } from "./fake-dom";

const text = (id: string, md: string) => ({ id, kind: "text", title: "", data: { markdown: md } });
const sec = (id: string, blocks: unknown[]) => ({ id, heading: id.toUpperCase(), guidance: "g", body: "", state: "wip", owner: null, bindings: {}, blocks });
const row = (sections: unknown[]) => ({ id: "d1", doc_type: "BEP", title: "T", status: "wip", stage: "pre_appointment", suitability: "S0", responds_to: null,
  responds_to_version: null, template_id: "bep-comprehensive", template_version: 1, updated_at: "t1", sections });
const flush = () => new Promise((r) => setTimeout(r, 0));
function ctxWith(docRow: unknown, ws: Record<string, unknown> = {}) {
  const st = { key: "snowdon-lifecycle", doc: docRow, versions: [], comments: [], ex: null, role: "lead", me: "lead@x", problems: [], message: "", viewing: null, respondsTo: null };
  return {
    st, doc: fakeDocument(), base: "http://b", canEdit: true, canGovern: true, focused: null, focus: vi.fn(), show: vi.fn(), refresh: vi.fn(), openDoc: vi.fn(),
    ws: { state: vi.fn(() => st), write: vi.fn(async () => null), post: vi.fn(async () => null), get: vi.fn(async () => null), rescore: vi.fn(async () => {}),
      open: vi.fn(), reload: vi.fn(), viewVersion: vi.fn(), ...ws },
  } as any;
}
const all = (root: HTMLElement, tag: string, attr: string, id: string) => findAll(root, tag).find((e) => (e as any).dataset[attr] === id)!;
const shell = (root: HTMLElement, id: string) => all(root, "div", "blockShell", id);
const section = (root: HTMLElement, id: string) => all(root, "section", "section", id);
const button = (el: HTMLElement, label: string) => findAll(el, "button").find((b) => textOf(b) === label);
const area = (root: HTMLElement, id: string) => findAll(shell(root, id), "textarea")[0] as HTMLTextAreaElement;

describe("ADDABLE_KINDS", () => {
  it("lists the five kinds a lead can add", () => {
    expect(ADDABLE_KINDS).toEqual(["text", "table", "matrix", "naming", "references"]);
  });
});

describe("editPane (G14)", () => {
  it("a save replaces only its section; other sections keep their elements and unsaved text in the same section survives", async () => {
    const saved = row([sec("s1", [text("a1", "ONE"), text("a2", "two")]), sec("s2", [text("b1", "three")])]);
    const ctx = ctxWith(row([sec("s1", [text("a1", "one"), text("a2", "two")]), sec("s2", [text("b1", "three")])]), { write: vi.fn(async () => saved) });
    const root = editPane(ctx);
    for (const id of ["a1", "a2", "b1"]) click(button(shell(root, id), "Edit")!);
    const s2 = section(root, "s2"), b1 = area(root, "b1");
    area(root, "a2").value = "typed, not saved";
    area(root, "a1").value = "ONE";
    click(button(shell(root, "a1"), "Save")!);
    await flush();
    expect(ctx.ws.write).toHaveBeenCalledWith("PUT", "/section/s1/blocks/a1", { title: "", data: { markdown: "ONE" } });
    expect(section(root, "s2")).toBe(s2);
    expect(area(root, "b1")).toBe(b1);
    expect(area(root, "a2").value).toBe("typed, not saved");
    expect(findAll(shell(root, "a1"), "textarea")).toHaveLength(0); // the saved block is shown rendered again
    expect(ctx.ws.rescore).toHaveBeenCalled(); expect(ctx.refresh).toHaveBeenCalledWith("side"); expect(ctx.refresh).not.toHaveBeenCalledWith("all");
  });
  it("Draft with AI fills that text block's area and writes nothing", async () => {
    const ctx = ctxWith(row([sec("s1", [text("a1", "")])]), { post: vi.fn(async () => ({ proposal: "Drafted text", provider: "local", model: "m", grounding_used: 2 })) });
    const root = editPane(ctx);
    click(button(shell(root, "a1"), "Edit")!);
    click(button(shell(root, "a1"), "Draft with AI")!);
    await flush();
    expect(ctx.ws.post).toHaveBeenCalledWith("/bimdocs/snowdon-lifecycle/d1/section/s1/draft", { provider: "local" });
    expect(area(root, "a1").value).toBe("Drafted text");
    expect(ctx.ws.write).not.toHaveBeenCalled();
    expect(textOf(shell(root, "a1"))).toContain("AI draft (local/m, grounded in 2 fact(s)): review it, then Save.");
  });
  it("a kind without an editor is shown as stored, with no Edit", () => {
    const root = editPane(ctxWith(row([sec("s1", [{ id: "f1", kind: "facts", title: "", data: { labels: ["appointing_party.name"], layout: "text" } }])])));
    expect(textOf(shell(root, "f1"))).toContain("Filled in a later release; shown as stored.");
    expect(button(shell(root, "f1"), "Edit")).toBeUndefined();
  });
});

describe("the picker lives in ai-picker.ts", () => {
  // Only the negative is pinned: Task 17 removes the old panel's last picker users and its import (the type check catches a missing one before then).
  it("the old panel keeps no picker of its own", () =>
    expect(readFileSync(new URL("../setups/docs-panel.ts", import.meta.url), "utf8")).not.toContain("const aiPicker = "));
});

describe("block operations", () => {
  const two = () => row([sec("s1", [text("a1", "one"), text("a2", "two")])]);
  it("Remove asks first, then removes; ↑ and ↓ send the new order; Add sends kind and after", async () => {
    const ctx = ctxWith(two(), { write: vi.fn(async () => two()) });
    const root = editPane(ctx);
    click(button(shell(root, "a2"), "Remove")!); await flush();
    expect(askYesNo).toHaveBeenCalledWith("Remove this Text? What it holds goes with it.", { doc: ctx.doc });
    expect(ctx.ws.write).toHaveBeenCalledWith("POST", "/section/s1/blocks/a2/remove");
    click(button(shell(root, "a2"), "↑")!); await flush();
    expect(ctx.ws.write).toHaveBeenCalledWith("PUT", "/section/s1/blocks", { order: ["a2", "a1"] });
    const plus = button(section(root, "s1"), "+ Add block")!;
    click(plus);
    const sel = findAll(section(root, "s1"), "select")[0] as any;
    sel.value = "table";
    click(button(section(root, "s1"), "Add")!); await flush();
    expect(ctx.ws.write).toHaveBeenCalledWith("POST", "/section/s1/blocks", { kind: "table", after: null });
  });
  it("a refused save shows the bridge's words in the shell and keeps the editor open", async () => {
    const ctx = ctxWith(two(), { write: vi.fn(async () => null) });
    ctx.ws.state.mockReturnValue({ ...ctx.st, message: "Nothing was saved. Because." });
    const root = editPane(ctx);
    click(button(shell(root, "a1"), "Edit")!); click(button(shell(root, "a1"), "Save")!); await flush();
    expect(textOf(shell(root, "a1"))).toContain("Nothing was saved. Because.");
    expect(area(root, "a1")).toBeDefined();
    expect(ctx.ws.rescore).not.toHaveBeenCalled();
  });
  it("without edit rights every section is read-only, no controls", () => {
    const ctx = ctxWith(two()); ctx.canEdit = false;
    const root = editPane(ctx);
    expect(findAll(root, "button")).toHaveLength(0);
    expect(textOf(section(root, "s1"))).toContain("one");
  });
  it("blockPath and guidanceOpen", () => {
    expect(blockPath("s 1", "b/1")).not.toContain(" ");
    expect(blockPath("s1")).toBe("/section/s1/blocks");
    expect(guidanceOpen({ doc: { status: "wip" }, versions: [] } as any)).toBe(true);
    expect(guidanceOpen({ doc: { status: "wip" }, versions: [{}] } as any)).toBe(false);
    expect(guidanceOpen({ doc: { status: "shared" }, versions: [] } as any)).toBe(false);
  });
});

describe("fix round 1", () => {
  const two = () => row([sec("s1", [text("a1", "one"), text("a2", "two")])]);
  it("Cancel discards a carried-over draft: reopening starts from the stored block", async () => {
    const saved = row([sec("s1", [text("a1", "ONE"), text("a2", "two")])]);
    const ctx = ctxWith(two(), { write: vi.fn(async () => saved) });
    const root = editPane(ctx);
    click(button(shell(root, "a1"), "Edit")!); click(button(shell(root, "a2"), "Edit")!);
    area(root, "a2").value = "typed once";
    click(button(shell(root, "a1"), "Save")!); await flush();
    expect(area(root, "a2").value).toBe("typed once"); // rebuilt open from its draft
    area(root, "a2").value = "typed more";
    click(button(shell(root, "a2"), "Cancel")!);
    click(button(shell(root, "a2"), "Edit")!);
    expect(area(root, "a2").value).toBe("two");
  });
  it("Draft with AI in a rebuilt editor and in another section posts to its own section", async () => {
    const saved = row([sec("s1", [text("a1", "ONE"), text("a2", "two")]), sec("s2", [text("b1", "x")])]);
    const ctx = ctxWith(row([sec("s1", [text("a1", "one"), text("a2", "two")]), sec("s2", [text("b1", "x")])]),
      { write: vi.fn(async () => saved), post: vi.fn(async () => ({ proposal: "P", provider: "local", model: "m", grounding_used: 0 })) });
    const root = editPane(ctx);
    for (const id of ["a1", "a2", "b1"]) click(button(shell(root, id), "Edit")!);
    click(button(shell(root, "a1"), "Save")!); await flush();
    click(button(shell(root, "a2"), "Draft with AI")!); await flush();
    click(button(shell(root, "b1"), "Draft with AI")!); await flush();
    expect((ctx.ws.post as any).mock.calls.map((c: any[]) => c[0])).toEqual(["/bimdocs/snowdon-lifecycle/d1/section/s1/draft", "/bimdocs/snowdon-lifecycle/d1/section/s2/draft"]);
  });
  it("a failed Add shows one message, not one per try", async () => {
    const ctx = ctxWith(two(), { write: vi.fn(async () => null) });
    ctx.ws.state.mockReturnValue({ ...ctx.st, message: "No." });
    const root = editPane(ctx);
    click(button(section(root, "s1"), "+ Add block")!);
    for (let i = 0; i < 3; i++) { click(button(section(root, "s1"), "Add")!); await flush(); }
    expect(textOf(section(root, "s1")).split("No.").length - 1).toBe(1);
  });
  it("a stale answer (project switched) shows no old message", async () => {
    const ctx = ctxWith(two(), { post: vi.fn(async () => null), write: vi.fn(async () => null) });
    ctx.ws.state.mockReturnValue({ ...ctx.st, key: "other", doc: null, message: "old unrelated" });
    const root = editPane(ctx);
    click(button(shell(root, "a1"), "Edit")!); click(button(shell(root, "a1"), "Draft with AI")!); await flush();
    click(button(shell(root, "a1"), "Save")!); await flush();
    expect(textOf(shell(root, "a1"))).not.toContain("old unrelated");
    expect(textOf(shell(root, "a1"))).not.toContain("could not be made");
    expect(textOf(shell(root, "a1"))).not.toContain("Nothing was saved");
  });
  it("D: a Draft with AI answer for a document no longer open is dropped", async () => {
    const ctx = ctxWith(two(), { post: vi.fn(async () => { ctx.ws.state.mockReturnValue({ ...ctx.st, doc: { ...ctx.st.doc, id: "d2" } }); return { proposal: "P", provider: "local", model: "m", grounding_used: 0 }; }) });
    const root = editPane(ctx);
    click(button(shell(root, "a1"), "Edit")!); click(button(shell(root, "a1"), "Draft with AI")!); await flush();
    expect(area(root, "a1").value).toBe("one");
    expect(textOf(shell(root, "a1"))).not.toContain("AI draft");
  });
  it("a non-2xx draft shows the bridge's words, or the fallback when there are none", async () => {
    const ctx = ctxWith(two(), { post: vi.fn(async () => null) });
    const root = editPane(ctx);
    click(button(shell(root, "a1"), "Edit")!); click(button(shell(root, "a1"), "Draft with AI")!); await flush();
    expect(textOf(shell(root, "a1"))).toContain("The AI draft could not be made.");
  });
  it("edges: Cancel of the Remove question, ↑ on the first and ↓ on the last send nothing", async () => {
    vi.mocked(askYesNo).mockResolvedValueOnce(false);
    const ctx = ctxWith(two());
    const root = editPane(ctx);
    click(button(shell(root, "a1"), "Remove")!); await flush();
    click(button(shell(root, "a1"), "↑")!); click(button(shell(root, "a2"), "↓")!); await flush();
    expect(ctx.ws.write).not.toHaveBeenCalled();
  });
  it("a section with no blocks array shows its one text block and an Add control", () => {
    const legacy = { id: "s1", heading: "S1", guidance: "", body: "legacy words", state: "wip", owner: null, bindings: {} };
    const root = editPane(ctxWith(row([legacy])));
    expect(textOf(shell(root, "s1.t0"))).toContain("legacy words");
    expect(button(section(root, "s1"), "+ Add block")).toBeDefined();
  });
});

describe("grid editors in the shell", () => {
  const tableBlock = { id: "t1", kind: "table", title: "", data: { group_by_team: false, columns: [{ key: "due", label: "Due", type: "date", choices: [], choices_from: null }], rows: [{ id: "r1", group: null, cells: { due: "2026-11-01" } }] } };
  const dateInput = (root: HTMLElement) => findAll(shell(root, "t1"), "input").find((i) => (i as any).dataset.field === "due") as any;
  it("Save is disabled while the table has problems, with no write, and enabled again when fixed", async () => {
    const ctx = ctxWith(row([sec("s1", [tableBlock])]), { write: vi.fn(async () => null) });
    const root = editPane(ctx);
    click(button(shell(root, "t1"), "Edit")!);
    const save = button(shell(root, "t1"), "Save") as any;
    expect(save.disabled).toBe(false);
    dateInput(root).value = "soon"; fire(dateInput(root), "input");
    expect(save.disabled).toBe(true);
    expect(textOf(shell(root, "t1"))).toContain("Row 1, Due: not a date.");
    click(save); await flush();
    expect(ctx.ws.write).not.toHaveBeenCalled();
    dateInput(root).value = ""; fire(dateInput(root), "input");
    expect(save.disabled).toBe(false);
    click(save); await flush();
    expect(ctx.ws.write).toHaveBeenCalledWith("PUT", "/section/s1/blocks/t1", { title: "", data: expect.objectContaining({ rows: [{ id: "r1", group: null, cells: { due: null } }] }) });
  });
  it("the three grid kinds have an Edit button", () => {
    const root = editPane(ctxWith(row([sec("s1", [tableBlock, { id: "m1", kind: "matrix", title: "", data: { preset: null, columns: [], show_milestone: false, show_recipient: false, rows: [] } },
      { id: "p1", kind: "references", title: "", data: { rows: [] } }])])));
    for (const id of ["t1", "m1", "p1"]) expect(button(shell(root, id), "Edit")).toBeDefined();
  });
});
