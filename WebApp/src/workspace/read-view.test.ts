import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DocRow, VersionListRow } from "../sentinel-core/doc-blocks";

const asks = vi.hoisted(() => ({ answer: "" as string | null, enforce: "reject" as string, failRead: false, asked: 0 }));
vi.mock("../setups/ask", () => ({ askText: async () => { asks.asked++; return asks.answer; }, askYesNo: async () => false }));
vi.mock("../setups/active-ruleset", () => ({ artefactInForce: async () => {
  if (asks.failRead) throw new Error("HTTP 500");
  return { body: { title: "SNW", separator: "_", enforce: asks.enforce, fields: [{ key: "p", label: "Project", enum: ["SNW"] }, { key: "n", label: "Number", pattern: "^[0-9]{4}$" }] } };
} }));

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
  beforeEach(() => { asks.answer = ""; asks.enforce = "reject"; asks.failRead = false; asks.asked = 0; });
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

describe("startPrint: what is printed (Review Focus 5)", () => {
  beforeEach(() => { asks.answer = ""; asks.enforce = "reject"; asks.failRead = false; asks.asked = 0; });
  const published = (key: string, extra: object = {}) => ({ ...emptyState(key), doc: doc({ status: "published" }), versions: [ver(2), ver(1)], ...extra });
  const noDraft = (popup: { document: Document }) => {
    const body = popup.document.body;
    expect(textOf(body)).not.toContain("live text"); expect(textOf(body)).not.toContain("Draft, live data");
    expect(findAll(body, "div").some((x) => x.dataset.runningHeader !== undefined)).toBe(false);
  };
  it("a published document prints its latest version's snapshot, never the live row", async () => {
    const { win, popup } = fakeWindow(); vi.stubGlobal("window", win);
    const { ctx } = ctxOf(published("p1"), () => ({ ...ver(2), document_id: "d1", snapshot: frozen }));
    await startPrint(ctx, () => {});
    expect(popup!.printed).toBe(true); expect(textOf(popup!.document.body)).toContain("frozen text"); expect(textOf(popup!.document.body)).toContain("Version: v2"); noDraft(popup!);
  });
  it("a version being viewed prints that version, not the latest", async () => {
    const { win, popup } = fakeWindow(); vi.stubGlobal("window", win);
    const old = doc({ status: "published", sections: [{ id: "s1", heading: "Aim", guidance: "", body: "older text", state: "wip", owner: null, bindings: {} }] });
    const { ctx, calls } = ctxOf(published("p2", { viewing: { ...ver(1), document_id: "d1", snapshot: old } }));
    await startPrint(ctx, () => {});
    expect(calls).toEqual([]); expect(textOf(popup!.document.body)).toContain("older text"); expect(textOf(popup!.document.body)).toContain("Version: v1"); noDraft(popup!);
  });
  it("a published document whose version cannot be read is never printed or shown as a draft", async () => {
    const { win, popup } = fakeWindow(); vi.stubGlobal("window", win);
    for (const st of [published("p3", { versions: [] }), published("p4")]) {
      const { ctx } = ctxOf(st), said: string[] = [];
      await startPrint(ctx, (t) => said.push(t));
      expect(popup!.printed).toBe(false); expect(said[said.length - 1]).toMatch(/^The published version could not be read. Nothing was printed.$/); expect(asks.asked).toBe(0);
      const el = readView(ctx); await flush();
      expect(textOf(el)).toContain("The published version could not be read."); expect(textOf(el)).not.toContain("Draft, live data"); expect(textOf(el)).not.toContain("live text");
    }
  });
  it("a version already fetched is not fetched again on the next render", async () => {
    const { ctx, calls } = ctxOf(published("p5"), () => ({ ...ver(2), document_id: "d1", snapshot: frozen }));
    readView(ctx); await flush(); readView(ctx); await flush();
    expect(calls.length).toBe(1);
  });
  it("a load that throws does not leave the page on Loading", async () => {
    const { ctx } = ctxOf(published("p6"), () => { throw new Error("boom"); });
    const el = readView(ctx); await flush();
    expect(textOf(el)).not.toContain("Loading the published version…"); expect(textOf(el)).toContain("could not be shown");
  });
});

describe("startPrint: the naming rule in force", () => {
  beforeEach(() => { asks.answer = "BAD"; asks.enforce = "reject"; asks.failRead = false; asks.asked = 0; });
  const run = async () => {
    const { win, popup } = fakeWindow(); vi.stubGlobal("window", win);
    const { ctx } = ctxOf({ ...emptyState("n1"), doc: doc() }), said: string[] = [];
    await startPrint(ctx, (t) => said.push(t));
    return { popup: popup!, said };
  };
  it("a rule that cannot be read refuses in words, before the question", async () => {
    asks.failRead = true; const { popup, said } = await run();
    expect(popup.printed).toBe(false); expect(asks.asked).toBe(0);
    expect(said[said.length - 1]).toBe("The naming rule could not be read, so the container ID was not checked. Nothing was printed.");
  });
  it("reject refuses with the reasons", async () => {
    const { popup, said } = await run();
    expect(popup.printed).toBe(false); expect(said[said.length - 1]).toMatch(/does not follow the naming rule in force.*Nothing was printed.$/);
  });
  it("an unknown enforce value refuses like reject", async () => {
    asks.enforce = "strict"; const { popup } = await run(); expect(popup.printed).toBe(false);
  });
  it("off prints without a check", async () => {
    asks.enforce = "off"; const { popup } = await run();
    expect(popup.printed).toBe(true); expect(textOf(popup.document.body)).toContain("Container ID: BAD");
  });
  it("warn prints and shows the problems as a note", async () => {
    asks.enforce = "warn"; const { popup, said } = await run();
    expect(popup.printed).toBe(true);
    expect(said[said.length - 1]).toMatch(/does not follow the naming rule in force/); expect(said[said.length - 1]).not.toContain("Nothing was printed");
  });
});

describe("startPrint: failures after the question", () => {
  beforeEach(() => { asks.answer = ""; asks.enforce = "reject"; asks.failRead = false; });
  it("a throw while printing is said in words", async () => {
    vi.stubGlobal("window", { open: () => { throw new Error("boom"); } });
    const { ctx } = ctxOf({ ...emptyState("f1"), doc: doc() }), said: string[] = [];
    await startPrint(ctx, (t) => said.push(t));
    expect(said[said.length - 1]).toBe("Could not print: boom");
  });
});
