import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DocRow, VersionListRow } from "../sentinel-core/doc-blocks";

const asks = vi.hoisted(() => ({ answer: "" as string | null }));
vi.mock("../setups/ask", () => ({ askText: async () => asks.answer, askYesNo: async () => false }));
vi.mock("../setups/active-ruleset", () => ({ artefactInForce: async () => ({ body: { title: "SNW", separator: "_", enforce: "reject", fields: [{ key: "p", label: "Project", enum: ["SNW"] }, { key: "n", label: "Number", pattern: "^[0-9]{4}$" }] } }) }));

import { emptyState } from "./workspace-state";
import { fakeDocument, fakeWindow, findAll, textOf, click } from "./fake-dom";
import { readView, startPrint } from "./read-view";

const doc = (o: Partial<DocRow> = {}): DocRow => ({ id: "d1", doc_type: "BEP", title: "SNW BEP", status: "wip", stage: "pre_appointment", suitability: "S0", responds_to: null, responds_to_version: null,
  template_id: null, template_version: null, updated_at: "t", sections: [{ id: "s1", heading: "Aim", guidance: "", body: "live text", state: "wip", owner: null, bindings: {} }], ...o });
const ver = (n: number): VersionListRow => ({ id: `v${n}`, version_no: n, label: `v${n}`, published_by: "a@x", published_at: "2026-10-21T10:00:00Z", revision: null, stage: null, suitability: null, sha: null });
const frozen = doc({ status: "published", sections: [{ id: "s1", heading: "Aim", guidance: "", body: "frozen text", state: "wip", owner: null, bindings: {} }] });

function ctxOf(st: ReturnType<typeof emptyState>, get: (path: string) => unknown = () => null) {
  const calls: string[] = [], back: (number | null)[] = [], d = fakeDocument();
  const ws = { state: () => st, get: async (p: string) => { calls.push(p); return get(p); }, viewVersion: async (n: number | null) => { back.push(n); } };
  return { ctx: { ws, st, doc: d, base: "http://b" } as never, calls, back, d };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("readView", () => {
  it("a draft says Draft, live data, shows live text and has no Back button", async () => {
    const { ctx } = ctxOf({ ...emptyState("k"), doc: doc() });
    const el = readView(ctx); await flush();
    expect(textOf(el)).toContain("Draft, live data: this is the document as it is now."); expect(textOf(el)).toContain("live text");
    expect(findAll(el, "button").map(textOf)).toEqual(["Print"]);
  });
  it("a published document reads its latest version's snapshot through the bridge", async () => {
    const { ctx, calls } = ctxOf({ ...emptyState("k"), doc: doc({ status: "published", sections: [] }), versions: [ver(2), ver(1)] }, () => ({ ...ver(2), document_id: "d1", snapshot: frozen }));
    const el = readView(ctx); await flush();
    expect(calls).toEqual(["/bimdocs/k/d1/versions/2"]);
    expect(textOf(el)).toContain("Version v2, v2: printed exactly as published."); expect(textOf(el)).toContain("frozen text");
  });
  it("a viewed version shows Back, which clears it", async () => {
    const { ctx, back } = ctxOf({ ...emptyState("k"), doc: doc({ status: "published" }), versions: [ver(1)], viewing: { ...ver(1), document_id: "d1", snapshot: frozen } });
    const el = readView(ctx); await flush();
    click(findAll(el, "button")[0]); expect(back).toEqual([null]);
  });
  it("an unreadable version says why", async () => {
    const { ctx } = ctxOf({ ...emptyState("k"), doc: doc({ status: "published" }), versions: [ver(1)], message: "Not allowed." });
    expect(textOf(readView(ctx))).toContain("Loading the published version…");
    const el = readView(ctx); await flush(); expect(textOf(el)).toContain("Not allowed.");
  });
});

describe("startPrint", () => {
  beforeEach(() => { asks.answer = ""; });
  it("an empty container ID prints; Cancel stops; a failing ID is refused with its reasons", async () => {
    const { win, popup } = fakeWindow(); vi.stubGlobal("window", win);
    const { ctx } = ctxOf({ ...emptyState("k"), doc: doc() }), said: string[] = [];
    await startPrint(ctx, (t) => said.push(t)); expect(popup!.printed).toBe(true); expect(textOf(popup!.document.body)).toContain("Container ID: not assigned");
    popup!.printed = false; asks.answer = null; await startPrint(ctx, (t) => said.push(t)); expect(popup!.printed).toBe(false);
    asks.answer = "BAD"; await startPrint(ctx, (t) => said.push(t)); expect(popup!.printed).toBe(false); expect(said[said.length - 1]).toMatch(/does not follow the naming rule in force.*Nothing was printed\.$/);
    asks.answer = "SNW_0001"; await startPrint(ctx, (t) => said.push(t)); expect(popup!.printed).toBe(true); expect(textOf(popup!.document.body)).toContain("Container ID: SNW_0001");
  });
  it("a blocked popup is said in words", async () => {
    vi.stubGlobal("window", fakeWindow({ blocked: true }).win);
    const { ctx } = ctxOf({ ...emptyState("k"), doc: doc() }), said: string[] = [];
    await startPrint(ctx, (t) => said.push(t)); expect(said[said.length - 1]).toBe("Popup blocked — allow popups for this page to print.");
  });
});
