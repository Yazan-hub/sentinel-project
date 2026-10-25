import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The page is built on the fake document; the project, the bridge and the other panes are stood in.
const proj = { key: "k", listeners: [] as (() => void)[] };
vi.mock("../setups/active-project", () => ({ activePid: () => proj.key, onActiveProjectChange: (cb: () => void) => { proj.listeners.push(cb); return () => {}; } }));
vi.mock("../setups/load-scope", () => ({ loadScope: (k: string) => `scope:${k}` }));
vi.mock("../setups/my-role", async (orig) => ({ ...(await orig<typeof import("../setups/my-role")>()), myRoleRead: async () => ({ role: "lead" }) }));
vi.mock("../setups/auth", () => ({ currentUser: async () => ({ email: "l@x" }), sessionUserId: () => "u1" }));
vi.mock("../setups/ask", () => ({ askYesNo: vi.fn(async () => true), askText: vi.fn() }));
vi.mock("../setups/ai-picker", async () => {
  const { fakeDocument } = await import("./fake-dom");
  return { aiBody: () => ({}), aiPicker: () => fakeDocument().createElement("span") };
});
// A plain value answers a GET of that path; "METHOD path" with a function answers a write (status and body, may wait).
type Answer = (body: any) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;
const answers: Record<string, unknown> = {};
const calls: { method: string; path: string; body: any }[] = [];
vi.mock("../setups/bridge-fetch", () => ({ bfetch: vi.fn(async (url: string, init?: RequestInit) => {
  const path = url.replace(/^http:\/\/b/, ""), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ method, path, body });
  const fn = answers[`${method} ${path}`] as Answer | undefined;
  const r = fn ? await fn(body) : { status: 200, body: path in answers ? answers[path] : [] };
  return { status: r.status, ok: r.status < 400, json: async () => r.body };
}) }));

import { askText, askYesNo } from "../setups/ask";
import { workspacePage } from "./workspace-page";
import { click, fakeDocument, findAll, textOf } from "./fake-dom";

const tick = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const row = (doc_type: string, sections: unknown[]) => ({ id: "d1", doc_type, title: "Doc", status: "wip", stage: "confirmed", suitability: "S0", responds_to: null, responds_to_version: null,
  template_id: null, template_version: null, updated_at: "t1", sections });
const proposal = { doc_type: "EIR", title: "Client EIR", source: {}, proposal: { sections: [{ heading: "1. A", guidance: "", body: "", fragments: [] }], unassigned: [] } } as any;
function page() {
  const el = workspacePage({ baseUrl: "http://b", onBack: () => {}, doc: fakeDocument() }) as any;
  const grid = el.childNodes[2], [outline, centre, side] = grid.childNodes;
  return { el, grid, outline, centre, side };
}

beforeEach(() => { proj.key = "k"; for (const k of Object.keys(answers)) delete answers[k]; calls.length = 0; });

describe("workspace page: ingest", () => {
  it("shows the review full width with the outline and side columns hidden", () => {
    const p = page();
    p.el.openIngest(proposal);
    expect(textOf(p.centre)).toContain("Review ingestion: Client EIR");
    expect(p.outline.style.display).toBe("none");
    expect(p.side.style.display).toBe("none");
    expect(p.grid.style.gridTemplateColumns).toBe("minmax(0,1fr)");
  });
  it("drops the review when a render comes for another project", () => {
    const p = page();
    p.el.openIngest(proposal);
    proj.key = "other";
    for (const cb of proj.listeners) cb();
    expect(textOf(p.centre)).not.toContain("Review ingestion");
    expect(p.outline.style.display).toBe("");
  });
});

describe("workspace page: READINESS and TIDP", () => {
  it("a TIDP document opens in Read with the read-only note above it", async () => {
    answers["/bimdocs/k/d1"] = row("TIDP", []);
    const p = page();
    await p.el.open("d1");
    await tick();
    expect(textOf(p.centre).startsWith("Old task team plans are read here; plan deliveries in Deliverables.")).toBe(true);
  });
  it("a READINESS document's Read centre is the readiness view", async () => {
    answers["/bimdocs/k/d1"] = row("READINESS", [{ id: "r1", heading: "12. Training", kind: "declared", question: "Is there a training plan?", answer: null, due: null }]);
    answers["/bimdocs/k/d1/readiness"] = { score: { pillars: { standards: {}, people: {}, process: {} } } };
    const p = page();
    await p.el.open("d1");
    await tick();
    const t = textOf(p.centre);
    expect(t).toContain("Answer the questions and plan in the Documents tab.");
    expect(t).toContain("Standards: Measured 0 met");
    expect(t).toContain("Is there a training plan?");
  });
});

// ---- F1, F2, F5, F6 (final review): unsaved editors survive a full redraw; a forced save refreshes the rest; showing the page again ----
const tb = (id: string, md: string) => ({ id, kind: "text", title: "", data: { markdown: md } });
const sc = (id: string, blocks: unknown[]) => ({ id, heading: id.toUpperCase(), guidance: "", body: "", state: "wip", owner: null, bindings: {}, blocks });
const bep = (a1: string, b1: string, updated_at = "t1", id = "d1") => ({ ...row("BEP", [sc("s1", [tb("a1", a1)]), sc("s2", [tb("b1", b1)])]), id, updated_at });
const shellOf = (root: HTMLElement, id: string) => findAll(root, "div").find((e) => (e as any).dataset.blockShell === id)!;
const areaOf = (root: HTMLElement, id: string) => findAll(shellOf(root, id), "textarea")[0] as any;
const press = (root: HTMLElement, label: string) => click(findAll(root, "button").find((b) => textOf(b) === label)!);
const header = (p: ReturnType<typeof page>) => p.el.childNodes[0] as HTMLElement;
async function openTyped(text = "typed, not saved") {
  answers["/bimdocs/k/d1"] = bep("one", "two");
  answers["/bimdocs/k/d1/executability"] = null;
  const p = page();
  await p.el.open("d1"); await tick();
  press(shellOf(p.centre, "a1"), "Edit");
  areaOf(p.centre, "a1").value = text;
  return p;
}

describe("F1: a full redraw keeps the unsaved text of open editors", () => {
  it("(a) an outline Rename redraws everything; the editor is open again with the typed text", async () => {
    const p = await openTyped();
    answers["PUT /bimdocs/k/d1/section/s2/heading"] = () => ({ status: 200, body: { ...bep("one", "two", "t2"), sections: [sc("s1", [tb("a1", "one")]), { ...sc("s2", [tb("b1", "two")]), heading: "Renamed" }] } });
    click(findAll(p.outline, "button").find((b) => textOf(b).includes("S2"))!);
    vi.mocked(askText).mockResolvedValueOnce("Renamed");
    press(p.outline, "Rename"); await tick();
    expect(textOf(p.centre)).toContain("Renamed");
    expect(areaOf(p.centre, "a1")?.value).toBe("typed, not saved");
  });
  it("(c) Edit, Read, Edit: the editor is open again with the typed text", async () => {
    const p = await openTyped();
    press(header(p), "Read"); await tick();
    expect(findAll(p.centre, "textarea")).toHaveLength(0);
    press(header(p), "Edit"); await tick();
    expect(areaOf(p.centre, "a1")?.value).toBe("typed, not saved");
  });
  it("another document opened in between carries no text", async () => {
    const p = await openTyped();
    answers["/bimdocs/k/d2"] = bep("x", "y", "t1", "d2");
    await p.el.open("d2"); await tick();
    await p.el.open("d1"); await tick();
    expect(findAll(p.centre, "textarea")).toHaveLength(0);
    expect(textOf(shellOf(p.centre, "a1"))).toContain("one");
  });
  it("a saved block reopens closed with the stored text", async () => {
    const p = await openTyped("saved words");
    answers["PUT /bimdocs/k/d1/section/s1/blocks/a1"] = () => ({ status: 200, body: bep("saved words", "two", "t2") });
    press(shellOf(p.centre, "a1"), "Save"); await tick();
    press(header(p), "Read"); await tick(); press(header(p), "Edit"); await tick();
    expect(findAll(shellOf(p.centre, "a1"), "textarea")).toHaveLength(0);
    expect(textOf(shellOf(p.centre, "a1"))).toContain("saved words");
  });
  it("a Draft with AI answer that lands after a redraw reaches the editor open now, and writes nothing", async () => {
    const p = await openTyped();
    let answer!: (v: { status: number; body: unknown }) => void;
    answers["POST /bimdocs/k/d1/section/s1/draft"] = () => new Promise((r) => { answer = r; });
    press(shellOf(p.centre, "a1"), "Draft with AI"); await tick();
    press(header(p), "Read"); await tick(); press(header(p), "Edit"); await tick();
    answer({ status: 200, body: { proposal: "Drafted", provider: "local", model: "m", grounding_used: 1 } }); await tick();
    expect(areaOf(p.centre, "a1").value).toBe("Drafted");
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });
  it("a Draft with AI answer that lands while the block is not open is dropped", async () => {
    const p = await openTyped();
    let answer!: (v: { status: number; body: unknown }) => void;
    answers["POST /bimdocs/k/d1/section/s1/draft"] = () => new Promise((r) => { answer = r; });
    press(shellOf(p.centre, "a1"), "Draft with AI"); await tick();
    press(header(p), "Read"); await tick();
    answer({ status: 200, body: { proposal: "Drafted", provider: "local", model: "m", grounding_used: 1 } }); await tick();
    press(header(p), "Edit"); await tick();
    expect(areaOf(p.centre, "a1").value).toBe("typed, not saved");
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });
});

describe("F2: after Save yours anyway?, the other sections show the latest text", () => {
  it("section A changed by someone else, Yes on section B: A shows their text, and A's Save sends the fresh updated_at", async () => {
    answers["/bimdocs/k/d1"] = bep("one", "two");
    answers["/bimdocs/k/d1/executability"] = null;
    const p = page();
    await p.el.open("d1"); await tick();
    let n = 0;
    answers["PUT /bimdocs/k/d1/section/s2/blocks/b1"] = () => (n++ === 0 ? { status: 409, body: { message: "stale write: the document changed" } } : { status: 200, body: bep("theirs", "mine", "t3") });
    answers["PUT /bimdocs/k/d1/section/s1/blocks/a1"] = () => ({ status: 200, body: bep("theirs, edited", "mine", "t4") });
    press(shellOf(p.centre, "b1"), "Edit");
    areaOf(p.centre, "b1").value = "mine";
    press(shellOf(p.centre, "b1"), "Save"); await tick();
    expect(textOf(shellOf(p.centre, "a1"))).toContain("theirs");
    expect(textOf(p.el.childNodes[1])).toContain("Saved. Other parts were refreshed with their latest text.");
    press(shellOf(p.centre, "a1"), "Edit");
    expect(areaOf(p.centre, "a1").value).toBe("theirs");
    press(shellOf(p.centre, "a1"), "Save"); await tick();
    expect(calls.filter((c) => c.method === "PUT" && c.path.endsWith("/a1")).map((c) => c.body.updated_at)).toEqual(["t3"]);
  });
});

describe("F5, F6: the page shown again", () => {
  const ro: { cb?: () => void } = {};
  beforeEach(() => { vi.stubGlobal("ResizeObserver", class { constructor(cb: () => void) { ro.cb = cb; } observe() {} }); });
  afterEach(() => vi.unstubAllGlobals());
  const showAgain = (p: ReturnType<typeof page>) => { p.el.clientWidth = 0; p.el.clientHeight = 0; ro.cb!(); p.el.clientWidth = 800; p.el.clientHeight = 600; ro.cb!(); };
  const reads = () => calls.filter((c) => c.method === "GET" && c.path === "/bimdocs/k/d1").length;
  const awayAndBack = () => { for (const k of ["other", "k"]) { proj.key = k; for (const cb of proj.listeners) cb(); } };
  it("F5: a held document is read again once when the page is shown again (the unsaved text stays: (b) ws.reload)", async () => {
    const p = await openTyped();
    const before = reads();
    showAgain(p); await tick();
    expect(reads()).toBe(before + 1);
    p.el.clientWidth = 801; ro.cb!(); await tick(); // a resize while shown reads nothing
    expect(reads()).toBe(before + 1);
    expect(areaOf(p.centre, "a1")?.value).toBe("typed, not saved");
  });
  it("F5: with no document held, the last document of the project is reopened as before", async () => {
    answers["/bimdocs/k/d1"] = bep("one", "two");
    const p = page();
    await p.el.open("d1"); await tick();
    awayAndBack(); await tick();
    expect(textOf(p.centre)).not.toContain("one");
    showAgain(p); await tick();
    expect(textOf(p.centre)).toContain("one");
  });
  it("F6: an ingest review on screen is not replaced by the last document", async () => {
    answers["/bimdocs/k/d1"] = bep("one", "two");
    const p = page();
    await p.el.open("d1"); await tick();
    awayAndBack(); await tick();
    p.el.openIngest(proposal);
    const before = reads();
    showAgain(p); await tick();
    expect(reads()).toBe(before);
    expect(textOf(p.centre)).toContain("Review ingestion: Client EIR");
  });
});

// ---- follow-up A, B: a failed re-read keeps the open editors; a carried draft over someone else's change asks first ----
describe("follow-up A: a failed re-read keeps every open editor", () => {
  const ro: { cb?: () => void } = {};
  beforeEach(() => { vi.stubGlobal("ResizeObserver", class { constructor(cb: () => void) { ro.cb = cb; } observe() {} }); });
  afterEach(() => vi.unstubAllGlobals());
  it("shown again, the re-read answers 503: the editor is still open with the text and the bar says so", async () => {
    const p = await openTyped();
    answers["GET /bimdocs/k/d1"] = () => ({ status: 503, body: { message: "the bridge is restarting" } });
    p.el.clientWidth = 0; p.el.clientHeight = 0; ro.cb!(); p.el.clientWidth = 800; p.el.clientHeight = 600; ro.cb!(); await tick();
    expect(areaOf(p.centre, "a1")?.value).toBe("typed, not saved");
    expect(textOf(p.el.childNodes[1])).toContain("The document could not be re-read: the bridge is restarting.");
    delete answers["GET /bimdocs/k/d1"];
    press(header(p), "Read"); await tick(); press(header(p), "Edit"); await tick();
    expect(areaOf(p.centre, "a1")?.value).toBe("typed, not saved");
  });
});

describe("follow-up B: a carried draft over a part someone else changed", () => {
  const Q = "Someone else changed this part while you were typing. Replace their version with yours?";
  const asked = () => vi.mocked(askYesNo).mock.calls.filter((c) => c[0] === Q);
  beforeEach(() => vi.mocked(askYesNo).mockClear());
  const changedUnderneath = async () => {
    const p = await openTyped("mine");
    answers["/bimdocs/k/d1"] = bep("theirs", "two", "t2");
    await p.el.open("d1"); await tick();
    return p;
  };
  it("reopens with the typed text and the line; No sends nothing and keeps the editor open", async () => {
    const p = await changedUnderneath();
    expect(areaOf(p.centre, "a1").value).toBe("mine");
    expect(textOf(shellOf(p.centre, "a1"))).toContain("Someone else changed this part while you were typing.");
    vi.mocked(askYesNo).mockResolvedValueOnce(false);
    press(shellOf(p.centre, "a1"), "Save"); await tick();
    expect(asked()).toHaveLength(1);
    expect(asked()[0][1]).toMatchObject({ ok: "Replace" });
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
    expect(areaOf(p.centre, "a1").value).toBe("mine");
  });
  it("Yes saves the typed text", async () => {
    const p = await changedUnderneath();
    answers["PUT /bimdocs/k/d1/section/s1/blocks/a1"] = () => ({ status: 200, body: bep("mine", "two", "t3") });
    press(shellOf(p.centre, "a1"), "Save"); await tick();
    expect(asked()).toHaveLength(1);
    expect(calls.filter((c) => c.method === "PUT").map((c) => c.body.data)).toEqual([{ markdown: "mine" }]);
  });
  it("an unchanged part saves as before, asking nothing", async () => {
    const p = await openTyped("mine");
    await p.el.open("d1"); await tick();
    expect(textOf(shellOf(p.centre, "a1"))).not.toContain("Someone else changed");
    answers["PUT /bimdocs/k/d1/section/s1/blocks/a1"] = () => ({ status: 200, body: bep("mine", "two", "t3") });
    press(shellOf(p.centre, "a1"), "Save"); await tick();
    expect(asked()).toHaveLength(0);
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });
});
