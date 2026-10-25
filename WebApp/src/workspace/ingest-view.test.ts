import { describe, it, expect, vi } from "vitest";

vi.mock("../setups/bridge-fetch", () => ({ bfetch: vi.fn() }));

import { defaultAssignment, foldPassages, ingestView } from "./ingest-view";
import { emptyState } from "./workspace-state";
import { click, fakeDocument, findAll, textOf } from "./fake-dom";

const tick = () => new Promise((r) => setTimeout(r, 0));
function pane(ws: any, st: any) {
  return { ws, st, doc: fakeDocument(), base: "", canEdit: true, canGovern: true, focused: null, focus: vi.fn(), show: vi.fn(), refresh: vi.fn(), openDoc: vi.fn(async () => {}) } as any;
}
async function press(el: HTMLElement, label: string) {
  click(findAll(el, "button").find((b) => textOf(b) === label)!);
  await tick(); await tick();
}

describe("foldPassages", () => {
  const secs = [{ heading: "1. A", guidance: "g", body: "" }, { heading: "2. B", guidance: "", body: "start" }];
  const un = [{ text: "p1" }, { text: "p2" }, { text: "p3" }];
  it("folds assigned passages in order onto a copy, so a retry never folds twice", () => {
    const out = foldPassages(secs, un, [1, null, 1]);
    expect(out).toEqual([{ heading: "1. A", guidance: "g", body: "" }, { heading: "2. B", guidance: "", body: "start\n\np1\n\np3" }]);
    expect(secs[1].body).toBe("start");
    expect(foldPassages(secs, un, [1, null, 1])).toEqual(out);
    expect(foldPassages(secs, un, [0, 0, 9])[0].body).toBe("p1\n\np2");
  });
  it("presets each passage to the section it names, by position", () =>
    expect(defaultAssignment(secs, [{ suggested_heading: "2. B" }, { suggested_heading: null }, { suggested_heading: "Nope" }])).toEqual([1, null, null]));
  it("Create document posts the folded sections to this project and opens the new document", async () => {
    const st = { ...emptyState("snowdon-lifecycle"), role: "lead", me: "lead@x" };
    const ws = { state: () => st, post: vi.fn(async () => ({ id: "new1" })), open: vi.fn(async () => {}) };
    const p = { doc_type: "EIR", title: "Client EIR", source: { file_id: "f" }, proposal: { sections: secs.map((s) => ({ ...s, fragments: [] })),
      unassigned: [{ text: "p1", pages: [2], suggested_heading: "2. B", confidence: 0.9, reason: "" }] } };
    const ctx = pane(ws, st);
    const el = ingestView(ctx, p as any, () => {});
    await press(el, "Create document");
    expect(ws.post).toHaveBeenCalledWith("/bimdocs/snowdon-lifecycle/ingest/commit", { doc_type: "EIR", title: "Client EIR", source: { file_id: "f" },
      sections: [{ heading: "1. A", guidance: "g", body: "" }, { heading: "2. B", guidance: "", body: "start\n\np1" }] });
    expect(ctx.openDoc).toHaveBeenCalledWith("new1");
    expect(ws.open).not.toHaveBeenCalled();
  });
  it("a refused commit keeps the proposal and brings the button back with the message", async () => {
    const st = { ...emptyState("k"), message: "" };
    const ws = { state: () => st, post: vi.fn(async () => { st.message = "Only a lead can create a document. Nothing was saved."; return null; }) };
    const p = { doc_type: "EIR", title: "T", source: {}, proposal: { sections: [{ heading: "1", guidance: "", body: "x", fragments: [] }], unassigned: [] } };
    const ctx = pane(ws, st);
    const el = ingestView(ctx, p as any, () => {});
    await press(el, "Create document");
    expect(textOf(el)).toContain("Only a lead can create a document. Nothing was saved.");
    expect((findAll(el, "button").find((b) => textOf(b) === "Create document")! as HTMLButtonElement).disabled).toBe(false);
    expect(ctx.openDoc).not.toHaveBeenCalled();
  });
  const one = { doc_type: "EIR", title: "T", source: {}, proposal: { sections: [{ heading: "1", guidance: "", body: "x", fragments: [] }], unassigned: [] } };
  it("says where to find the new document when opening it did not land", async () => {
    const st = { ...emptyState("k"), doc: null as any };
    const ws = { state: () => st, post: vi.fn(async () => ({ id: "new1" })) };
    const el = ingestView(pane(ws, st), one as any, () => {});
    await press(el, "Create document");
    expect(textOf(el)).toContain("Created. Open it from the Documents tab.");
  });
  it("says nothing more when the new document is open", async () => {
    const st = { ...emptyState("k"), doc: null as any };
    const ws = { state: () => st, post: vi.fn(async () => ({ id: "new1" })) };
    const c = pane(ws, st);
    c.openDoc = vi.fn(async () => { st.doc = { id: "new1" }; });
    const el = ingestView(c, one as any, () => {});
    await press(el, "Create document");
    expect(textOf(el)).not.toContain("Open it from the Documents tab");
  });
  it("reads a proposal without fragments or unassigned passages", async () => {
    const st = emptyState("k");
    const ws = { state: () => st, post: vi.fn(async () => ({ id: "n" })) };
    const p = { ...one, proposal: { sections: [{ heading: "1", guidance: "", body: "x" }] } };
    const el = ingestView(pane(ws, st), p as any, () => {});
    await press(el, "Create document");
    expect(ws.post).toHaveBeenCalled();
  });
});
