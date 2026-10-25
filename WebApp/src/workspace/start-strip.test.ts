import { describe, it, expect, vi } from "vitest";

vi.mock("../setups/bridge-fetch", () => ({ bfetch: vi.fn() }));
vi.mock("../setups/ask", () => ({ askYesNo: vi.fn(async () => true), askText: vi.fn() }));

import { askYesNo } from "../setups/ask";
import { eirChoices, hasStart, linkEirButton, nextSteps, showStrip, startStrip } from "./start-strip";
import { createWorkspace, emptyState } from "./workspace-state";
import { click, fakeDocument, findAll, textOf } from "./fake-dom";

const t0 = (id: string) => ({ id: `${id}.t0`, kind: "text", title: "", data: { markdown: "" } });
const bep = (o: Record<string, unknown> = {}) => ({ id: "d1", doc_type: "BEP", title: "B", template_id: "bep-comprehensive", status: "wip", responds_to: null,
  sections: [{ id: "s1", heading: "1", owner: null, blocks: [t0("s1")] }, { id: "s2", heading: "2", owner: "a@x", template_key: "eir-response", blocks: [t0("s2")] }], ...o }) as any;
const ex = (written: number, sections: number) => ({ summary: { written, sections } }) as any;
const START = "Pick a start: EIR received, or no EIR received.", LEADS = "Name a section lead for every section.",
  WRITE = "Write each section. Publishing stays in the Documents tab until review rounds arrive.";

describe("nextSteps", () => {
  it("a new comprehensive BEP has three open lines", () =>
    expect(nextSteps(bep(), ex(0, 2))).toEqual([{ label: START, done: false }, { label: LEADS, done: false }, { label: WRITE, done: false }]));
  it("marks each line done from the document", () => {
    const d = bep({ responds_to: "e1", sections: [{ id: "s1", owner: "b@x", blocks: [] }, { id: "s2", owner: "a@x", template_key: "eir-response", blocks: [] }] });
    expect(nextSteps(d, ex(2, 2)).map((s) => s.done)).toEqual([true, true, true]);
    expect(nextSteps(bep(), null)[2].done).toBe(false);
  });
  it("another document has no start line", () => expect(nextSteps(bep({ doc_type: "EIR", template_id: "eir" }), ex(0, 2)).map((s) => s.label)).toEqual([LEADS, WRITE]));
});

describe("hasStart, showStrip, eirChoices", () => {
  it("a start is a linked EIR or the inserted statement", () => {
    expect(hasStart(bep())).toBe(false);
    expect(hasStart(bep({ responds_to: "e1" }))).toBe(true);
    expect(hasStart(bep({ sections: [{ id: "s2", blocks: [{ id: "s2.part-e", kind: "text", title: "", data: { markdown: "x" } }] }] }))).toBe(true);
  });
  it("the strip shows only on a draft with no version and a line left", () => {
    expect(showStrip(bep(), [], ex(0, 2))).toBe(true);
    expect(showStrip(bep(), [{ version_no: 1 } as any], ex(0, 2))).toBe(false);
    expect(showStrip(bep({ status: "shared" }), [], ex(0, 2))).toBe(false);
  });
  it("offers the project's EIRs that are not archived", () =>
    expect(eirChoices([{ id: "e1", doc_type: "EIR", title: "Client EIR", status: "published" }, { id: "e2", doc_type: "EIR", title: "Old", status: "archived" },
      { id: "b1", doc_type: "BEP", title: "B", status: "wip" }])).toEqual([{ id: "e1", title: "Client EIR" }]));
  it("an EIR that is not published yet says so", () =>
    expect(eirChoices([{ id: "e3", doc_type: "EIR", title: "Draft EIR", status: "wip" }])).toEqual([{ id: "e3", title: "Draft EIR (not yet published)" }]));
});

const tick = () => new Promise((r) => setTimeout(r, 0));
const list = [{ id: "e1", doc_type: "EIR", title: "Client EIR", status: "published" }, { id: "e3", doc_type: "EIR", title: "Next EIR", status: "wip" }];
function live(o: { canGovern?: boolean; doc?: any; list?: any } = {}) {
  const st = { ...emptyState("snowdon-lifecycle"), doc: o.doc ?? bep(), role: "lead", message: "", ex: ex(0, 2) };
  const write = vi.fn(async () => bep());
  const get = vi.fn(async () => (o.list === undefined ? list : o.list));
  const refresh = vi.fn();
  return { ws: { write, get, state: () => st }, st, doc: fakeDocument(), base: "", canEdit: true, canGovern: o.canGovern ?? true, focused: null,
    focus: vi.fn(), show: vi.fn(), refresh, openDoc: vi.fn(), write, get } as any;
}
const labelled = (el: HTMLElement, label: string) => findAll(el, "button").find((b) => textOf(b) === label)!;
async function press(root: HTMLElement, label: string) { click(labelled(root, label)); await tick(); await tick(); }

describe("startStrip sends the start route's body", () => {
  it("No EIR received, answered yes", async () => {
    const c = live(), root = startStrip(c)!; await press(root, "No EIR received");
    expect(askYesNo).toHaveBeenCalledWith("Insert the statement that the project is not yet following ISO 19650, and the clause 5.3.2 checklist?", { doc: c.doc });
    expect(c.write).toHaveBeenCalledWith("POST", "/start", { start: "no_eir" }); expect(c.refresh).toHaveBeenCalledWith("all");
  });
  it("No EIR received, answered no, sends nothing", async () => {
    vi.mocked(askYesNo).mockResolvedValueOnce(false);
    const c = live(), root = startStrip(c)!; await press(root, "No EIR received");
    expect(c.write).not.toHaveBeenCalled();
  });
  it("EIR received, then Link", async () => {
    const c = live(), root = startStrip(c)!; await press(root, "EIR received…"); await press(root, "Link");
    expect(c.get).toHaveBeenCalledWith("/bimdocs/snowdon-lifecycle");
    expect(c.write).toHaveBeenCalledWith("POST", "/start", { start: "eir_received", eir_id: "e1" });
    expect(c.refresh).toHaveBeenCalledWith("all");
  });
  it("the select labels an unpublished EIR and Link sends the picked one", async () => {
    const c = live(), root = startStrip(c)!; await press(root, "EIR received…");
    expect(textOf(root)).toContain("Next EIR (not yet published)");
    const sel = findAll(root, "select")[0] as any; sel.value = "e3"; await press(root, "Link");
    expect(c.write).toHaveBeenCalledWith("POST", "/start", { start: "eir_received", eir_id: "e3" });
  });
  it("no EIR in the project says where to ingest one", async () => {
    const c = live({ list: [{ id: "b1", doc_type: "BEP", title: "B", status: "wip" }] }), root = startStrip(c)!; await press(root, "EIR received…");
    expect(textOf(root)).toContain("No EIR in this project yet: ingest it from the Documents tab first.");
    expect(c.write).not.toHaveBeenCalled();
  });
  it("a refusal shows the bridge words and does not refresh", async () => {
    const c = live(); c.write.mockResolvedValueOnce(null); c.st.message = "This BEP already has its start. Nothing was saved.";
    const root = startStrip(c)!; await press(root, "No EIR received");
    expect(textOf(root)).toContain("This BEP already has its start. Nothing was saved."); expect(c.refresh).not.toHaveBeenCalled();
  });
  it("an unreadable list says so", async () => {
    const c = live({ list: null }), root = startStrip(c)!; await press(root, "EIR received…");
    expect(textOf(root)).toContain("The document list could not be read.");
  });
  it("a reader sees the lines and no button; a started BEP offers neither start", () => {
    const r = startStrip(live({ canGovern: false }))!;
    expect(textOf(r)).toContain(START); expect(findAll(r, "button")).toHaveLength(0);
    const s = startStrip(live({ doc: bep({ responds_to: "e1" }) }))!;
    expect(findAll(s, "button")).toHaveLength(0); expect(textOf(s)).toContain("✓ " + START);
  });
  it("no strip once a version exists", () => {
    const c = live(); c.st.versions = [{ version_no: 1 }];
    expect(startStrip(c)).toBeNull();
  });
});

describe("linkEirButton", () => {
  it("is for a lead on a comprehensive BEP with no EIR, and sends the same call", async () => {
    expect(linkEirButton(live({ canGovern: false }))).toBeNull();
    expect(linkEirButton(live({ doc: bep({ responds_to: "e1" }) }))).toBeNull();
    expect(linkEirButton(live({ doc: bep({ template_id: "bep" }) }))).toBeNull();
    const c = live(), el = linkEirButton(c)!; await press(el, "Link an EIR…"); await press(el, "Link");
    expect(c.write).toHaveBeenCalledWith("POST", "/start", { start: "eir_received", eir_id: "e1" });
  });
});

function deferred<T>() { let resolve!: (v: T) => void; const p = new Promise<T>((r) => { resolve = r; }); return { p, resolve }; }

describe("double clicks", () => {
  it("two clicks on EIR received before the list answers leave one select and one Link", async () => {
    const c = live(), d = deferred<any>(); c.get.mockReturnValue(d.p);
    const root = startStrip(c)!; click(labelled(root, "EIR received…")); click(labelled(root, "EIR received…"));
    d.resolve(list); await tick(); await tick();
    expect(findAll(root, "select")).toHaveLength(1); expect(findAll(root, "button").filter((b) => textOf(b) === "Link")).toHaveLength(1);
  });
  it("two Link presses send one start, and Link is disabled meanwhile", async () => {
    const c = live(), d = deferred<any>(); c.write.mockReturnValue(d.p);
    const root = startStrip(c)!; await press(root, "EIR received…");
    const link = labelled(root, "Link"); click(link); click(link); await tick();
    expect(c.write).toHaveBeenCalledTimes(1); expect((link as any).disabled).toBe(true);
    d.resolve(bep()); await tick(); await tick(); expect(c.refresh).toHaveBeenCalledTimes(1);
  });
  it("Link works again after a refusal", async () => {
    const c = live(); c.write.mockResolvedValueOnce(null);
    const root = startStrip(c)!; await press(root, "EIR received…");
    const link = labelled(root, "Link"); await press(root, "Link");
    expect((link as any).disabled).toBe(false);
    await press(root, "Link"); expect(c.write).toHaveBeenCalledTimes(2);
  });
  it("two presses on No EIR received send one start", async () => {
    const c = live(), d = deferred<any>(); c.write.mockReturnValue(d.p);
    const root = startStrip(c)!; click(labelled(root, "No EIR received")); click(labelled(root, "No EIR received")); await tick(); await tick();
    expect(c.write).toHaveBeenCalledTimes(1);
    d.resolve(bep()); await tick();
  });
  it("a question that fails becomes a line, not an unhandled rejection", async () => {
    vi.mocked(askYesNo).mockRejectedValueOnce(new Error("no window"));
    const c = live(); c.st.message = "";
    const root = startStrip(c)!; await press(root, "No EIR received");
    expect(c.write).not.toHaveBeenCalled(); expect(textOf(root)).toContain("The start was not saved.");
    expect(textOf(root)).not.toContain("Nothing was saved.");
  });
});

describe("a stale answer shows nothing", () => {
  it("the project switched while the list was read", async () => {
    const c = live({ list: null }); c.get.mockImplementation(async () => { c.ws.state = () => ({ ...c.st, key: "other" }); return null; });
    const root = startStrip(c)!; await press(root, "EIR received…");
    expect(textOf(root)).not.toContain("could not be read");
  });
  it("the project switched while the start was written", async () => {
    const c = live(); c.write.mockImplementation(async () => { c.ws.state = () => ({ ...c.st, key: "other" }); return null; });
    const root = startStrip(c)!; await press(root, "No EIR received");
    expect(textOf(root)).not.toContain("not saved"); expect(c.refresh).not.toHaveBeenCalled();
  });
});

describe("a section that is null in the list", () => {
  it("nextSteps and hasStart ignore it", () => {
    const d = bep({ sections: [null, { id: "s2", owner: "a@x", template_key: "eir-response", blocks: [] }] });
    expect(nextSteps(d, ex(1, 1)).map((s) => s.done)).toEqual([false, true, true]);
    expect(hasStart(d)).toBe(false);
  });
});

describe("a refusal through the real controller", () => {
  it("the 422 words from the bridge reach the strip", async () => {
    const words = "This BEP already has its start. Nothing was saved.";
    const json = vi.fn(async (m: string, p: string) => {
      if (m === "POST" && p.endsWith("/start")) return { status: 422, body: { message: words } };
      if (p === "/bimdocs/k/d1") return { status: 200, body: bep() };
      return { status: 200, body: p.endsWith("/executability") ? null : [] };
    });
    const ws = createWorkspace({ json: json as any, activePid: () => "k", scope: () => "k", onProjectChange: () => () => {}, askYesNo: async () => true, role: async () => "lead", me: async () => "lead@x" }, () => {});
    await ws.open("d1");
    const refresh = vi.fn(), c = { ws, st: ws.state(), doc: fakeDocument(), base: "", canEdit: true, canGovern: true, focused: null, focus: vi.fn(), show: vi.fn(), refresh, openDoc: vi.fn() } as any;
    const root = startStrip(c)!; await press(root, "No EIR received");
    expect(textOf(root)).toContain(words); expect(refresh).not.toHaveBeenCalled();
  });
});
