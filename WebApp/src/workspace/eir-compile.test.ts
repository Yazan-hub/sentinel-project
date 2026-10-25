import { describe, it, expect, vi } from "vitest";

vi.mock("../setups/bridge-fetch", () => ({ bfetch: vi.fn() }));
vi.mock("../setups/active-ruleset", () => ({ artefactInForce: vi.fn(async () => ({ sha256: "ab12", body: {} })), installArtefact: vi.fn(async () => ({ kind: "ids", version: 3, sha256: "cd" })) }));

import { artefactInForce, installArtefact } from "../setups/active-ruleset";
import { compileLines, eirCompile, eirText } from "./eir-compile";
import { emptyState } from "./workspace-state";
import { click, fakeDocument, findAll, textOf } from "./fake-dom";

const tick = () => new Promise((r) => setTimeout(r, 0));
function pane(ws: any, st: any) {
  return { ws, st, doc: fakeDocument(), base: "http://b", canEdit: true, canGovern: true, focused: null, focus: vi.fn(), show: vi.fn(), refresh: vi.fn(), openDoc: vi.fn(async () => {}) } as any;
}
async function press(el: HTMLElement, label: string) {
  click(findAll(el, "button").find((b) => textOf(b) === label)!);
  await tick(); await tick();
}
const result = { stats: { compiled: 1, requirement_sentences: 1 }, specifications: [{ name: "n", source_sentence: "s" }], unmatched: [], skipped: [], kept: 0, current: null, xml_skipped: [], xml: "<ids/>", ids: { title: "t" } };
const lead = (extra: Record<string, unknown> = {}) => ({ ...emptyState("k"), doc: { id: "e1", doc_type: "EIR", title: "Client EIR", sections: [] } as any, role: "lead", me: "lead@x", ...extra });

describe("eirText", () => {
  it("joins the title, headings and bodies as the old panel did", () =>
    expect(eirText({ title: "Client EIR", sections: [{ heading: "1. Context", body: "Why" }, { heading: "2. Reqs", body: "" }] } as any)).toBe("Client EIR\n\n1. Context\n\nWhy\n\n2. Reqs"));
});
describe("compileLines", () => {
  it("says what was compiled, from which sentence, and what is not in the IDS", () => {
    const lines = compileLines({ stats: { compiled: 1, requirement_sentences: 2 }, specifications: [{ name: "Doors have a fire rating", source_sentence: "All doors shall have a fire rating." }],
      unmatched: [{ sentence: "The model shall be nice.", reason: "No property is named." }], skipped: [], kept: 0, current: null, xml_skipped: [], xml: "", ids: {} });
    expect(lines).toContainEqual({ text: "Doors have a fire rating", tone: "ok" });
    expect(lines).toContainEqual({ text: "from: “All doors shall have a fire rating.”", tone: "note" });
    expect(lines).toContainEqual({ text: "Not in the IDS: “The model shall be nice.”", tone: "bad" });
    expect(lines[0].tone).toBe("head");
    expect(lines.map((l) => l.text).join(" ")).not.toMatch(/source_sentence|unmatched| — /);
  });
});
describe("F-R1b-3: a held-back line has no dash", () => {
  it("the bridge's wording is split into sentences", () => {
    const lines = compileLines({ stats: {}, specifications: [], unmatched: [], kept: 0, current: null, xml_skipped: [], xml: "", ids: {},
      skipped: [{ name: "WALL — FireRating", reason: "already checked by 'Walls carry fire rating' — held back so it is not checked twice, and put back if that check goes" }] });
    expect(lines).toContainEqual({ text: "WALL, FireRating: already checked by 'Walls carry fire rating'. Held back so it is not checked twice, and put back if that check goes.", tone: "warn" });
    expect(lines.map((l) => l.text).join(" ")).not.toContain(" — ");
  });
});
describe("eirCompile install", () => {
  it("sends If-Match with the sha of the IDS in force read before the compile", async () => {
    const st = lead();
    const el = eirCompile(pane({ state: () => st, post: vi.fn(async () => result) }, st));
    await press(el, "Compile to IDS"); await press(el, "Install on this project");
    expect(installArtefact).toHaveBeenCalledWith("http://b", "k", "ids", expect.objectContaining({ title: "t", source: expect.objectContaining({ document_id: "e1" }) }), "lead@x", "ab12");
    expect(textOf(el)).toContain("Installed ids@3 on k.");
  });
  it("posts the EIR text to this project's compile route", async () => {
    const st = lead();
    const post = vi.fn(async () => result);
    await press(eirCompile(pane({ state: () => st, post }, st)), "Compile to IDS");
    expect(post).toHaveBeenCalledWith("/cde/k/artefacts/ids/eir", { text: "Client EIR", title: "Client EIR, compiled IDS" });
  });
  it("says so in words on a 412 and installs nothing more", async () => {
    vi.mocked(installArtefact).mockRejectedValueOnce(Object.assign(new Error("changed"), { status: 412 }));
    const st = lead();
    const el = eirCompile(pane({ state: () => st, post: vi.fn(async () => result) }, st));
    await press(el, "Compile to IDS"); await press(el, "Install on this project");
    expect(textOf(el)).toContain("The IDS in force changed while you looked; compile again. Nothing was installed.");
  });
  it("offers Install only to a lead, and only when something was compiled", async () => {
    const st = lead();
    const el = eirCompile(pane({ state: () => st, post: vi.fn(async () => ({ ...result, specifications: [] })) }, st));
    await press(el, "Compile to IDS");
    expect(findAll(el, "button").map(textOf)).not.toContain("Install on this project");
    const st2 = lead({ role: "contributor" }), c2 = pane({ state: () => st2, post: vi.fn(async () => result) }, st2); // F4: by role, not by canGovern
    const el2 = eirCompile(c2);
    await press(el2, "Compile to IDS");
    expect(findAll(el2, "button").map(textOf)).not.toContain("Install on this project");
  });
  it("shows nothing when the project changed meanwhile", async () => {
    const st = lead(), live = { ...st };
    const el = eirCompile(pane({ state: () => live, post: vi.fn(async () => { live.key = "other"; return result; }) }, st));
    await press(el, "Compile to IDS");
    expect(textOf(el)).not.toContain("Checks from this EIR");
  });
  it("blocks the compile with the reason when the IDS in force cannot be read", async () => {
    vi.mocked(artefactInForce).mockRejectedValueOnce(new Error("HTTP 500"));
    const st = lead(), post = vi.fn(async () => result);
    const el = eirCompile(pane({ state: () => st, post }, st));
    await press(el, "Compile to IDS");
    expect(textOf(el)).toContain("The IDS in force could not be read: HTTP 500");
    expect(post).not.toHaveBeenCalled();
  });
  it("offers no install over an IDS in force that has no sha", async () => {
    vi.mocked(artefactInForce).mockResolvedValueOnce({ sha256: null, body: {} } as any);
    const st = lead();
    const el = eirCompile(pane({ state: () => st, post: vi.fn(async () => result) }, st));
    await press(el, "Compile to IDS");
    expect(findAll(el, "button").map(textOf)).not.toContain("Install on this project");
    expect(textOf(el)).toContain("The IDS in force could not be read; nothing can be installed now.");
  });
  it("downloads the .ids as an application/xml Blob through an a[download] click", async () => {
    const made: Blob[] = [], clicked: any[] = [];
    const url = globalThis.URL as any, was = [url.createObjectURL, url.revokeObjectURL];
    url.createObjectURL = (b: Blob) => { made.push(b); return "blob:x"; }; url.revokeObjectURL = () => {};
    try {
      const st = lead(), c = pane({ state: () => st, post: vi.fn(async () => result) }, st), orig = c.doc.createElement;
      c.doc.createElement = (t: string) => { const e = orig(t); if (t === "a") e.click = () => clicked.push(e); return e; };
      const el = eirCompile(c);
      await press(el, "Compile to IDS"); await press(el, "Download .ids");
      expect(made).toHaveLength(1);
      expect(made[0].type).toBe("application/xml");
      expect(await made[0].text()).toBe("<ids/>");
      expect(clicked).toHaveLength(1);
      expect([clicked[0].getAttribute("href"), clicked[0].getAttribute("download")]).toEqual(["blob:x", "Client-EIR.ids"]);
    } finally { [url.createObjectURL, url.revokeObjectURL] = was; }
  });
});

describe("final review: install by role on any status (F4), Download .ids (F13)", () => {
  const published = (role: string) => lead({ role, doc: { id: "e1", doc_type: "EIR", title: "Client EIR", status: "published", sections: [] } });
  it("F4: a published EIR shows Install to a lead after Compile; a contributor sees none", async () => {
    for (const [role, shown] of [["lead", true], ["contributor", false]] as const) {
      const st = published(role), c = pane({ state: () => st, post: vi.fn(async () => result) }, st);
      c.canGovern = false; c.canEdit = false; // what rightsOf gives for a published document
      const el = eirCompile(c);
      await press(el, "Compile to IDS");
      expect(findAll(el, "button").some((b) => textOf(b) === "Install on this project"), role).toBe(shown);
    }
  });
  it("F13: the file name keeps any letters and digits; the link is revoked after the click had time", async () => {
    vi.useFakeTimers();
    try {
      const made: any[] = [], revoked: string[] = [];
      vi.stubGlobal("URL", { createObjectURL: () => "blob:1", revokeObjectURL: (u: string) => { revoked.push(u); } });
      for (const [title, name] of [["مخطط EIR 2", "مخطط-EIR-2.ids"], ["!!!", "compiled.ids"]]) {
        const st = lead({ doc: { id: "e1", doc_type: "EIR", title, sections: [] } }), c = pane({ state: () => st, post: vi.fn(async () => result) }, st);
        const make = c.doc.createElement.bind(c.doc);
        c.doc.createElement = (t: string) => { const e = make(t); if (t === "a") { e.click = vi.fn(); made.push(e); } return e; };
        const el = eirCompile(c);
        click(findAll(el, "button").find((b) => textOf(b) === "Compile to IDS")!);
        await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(0);
        click(findAll(el, "button").find((b) => textOf(b) === "Download .ids")!);
        expect(made[made.length - 1].getAttribute("download")).toBe(name);
        expect(made[made.length - 1].click).toHaveBeenCalled();
        expect(revoked).toEqual([]);
        await vi.advanceTimersByTimeAsync(1000);
        expect(revoked).toEqual(["blob:1"]);
        revoked.length = 0;
      }
    } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
  });
});
