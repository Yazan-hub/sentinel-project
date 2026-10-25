import { describe, it, expect, vi } from "vitest";
import type { CommentRow, DocRow, Executability, SectionRow, VersionListRow } from "../sentinel-core/doc-blocks";

vi.mock("../setups/ask", () => ({ askText: vi.fn(async () => "New heading"), askYesNo: vi.fn(async () => true) }));
// the one fetched-version cache is read-view's (tested there); here a version is read through the controller's get
vi.mock("./read-view", () => ({
  startPrint: vi.fn(),
  readVersion: vi.fn(async (ctx: any, n: number) => ctx.ws.get(`/bimdocs/k/${ctx.ws.state().doc.id}/versions/${n}`)),
}));

import { askText, askYesNo } from "../setups/ask";
import { readVersion } from "./read-view";
import { answersLine, commentsTab, filterSections, initials, isComprehensive, outlinePane, removeQuestion, sectionChips } from "./outline";
import { emptyState } from "./workspace-state";
import { fakeDocument, findAll, textOf, click } from "./fake-dom";

const sec = (id: string, o: Partial<SectionRow> = {}): SectionRow => ({ id, heading: `H ${id}`, guidance: "", body: "x", state: "wip", owner: null, bindings: {}, ...o });
const bound = { checks: [{ id: "cde.states" }, { id: "loin.levels" }] };
const ex = (written: Record<string, boolean>) => ({ sections: Object.entries(written).map(([section_id, w]) => ({ section_id, written: w })) }) as unknown as Executability;
const comment = (section_id: string, o: Partial<CommentRow> = {}): CommentRow => ({ id: `c-${section_id}`, section_id, author: "a@x", text: "t", created_at: "2026-10-25T09:00:00Z", ...o });
const doc = (o: Partial<DocRow> = {}): DocRow => ({ id: "d1", doc_type: "BEP", title: "SNW BEP", status: "wip", stage: "pre_appointment", suitability: "S0", responds_to: null, responds_to_version: null, template_id: "bep", template_version: 1, updated_at: "t", sections: [sec("s1", { owner: "Lead@X.com", bindings: bound }), sec("s2")], ...o });

describe("outline helpers", () => {
  it("initials: the e-mail's local part, at most two letters", () => {
    expect(initials("anna.lee@x.com")).toBe("AL"); expect(initials("bob_smith-jr@x")).toBe("BS"); expect(initials("yazan@x")).toBe("Y");
    expect(initials(null)).toBe("—"); expect(initials("")).toBe("—");
    expect(initials("émile.dupont@x")).toBe("ÉD"); expect(initials("émile@x")).toBe("É");
  });
  it("chips: comments, Unbound, Empty", () => {
    expect(sectionChips(sec("s1", { bindings: bound }), ex({ s1: true }), [comment("s1"), comment("s1")])).toEqual(["2 comments"]);
    expect(sectionChips(sec("s2"), ex({ s2: false }), [comment("s2")])).toEqual(["1 comment", "Unbound", "Empty"]);
    expect(sectionChips(sec("s3", { bindings: { checks: "x" } as never }), null, [])).toEqual(["Unbound"]);
  });
  it("filters: mine (any case), comments, unbound, changed", () => {
    const s = doc().sections, o = { me: "lead@x.com", comments: [comment("s2")], ex: null, changed: new Set(["s2"]) };
    expect(filterSections(s, "all", o).map((x) => x.id)).toEqual(["s1", "s2"]);
    expect(filterSections(s, "mine", o).map((x) => x.id)).toEqual(["s1"]);
    for (const f of ["comments", "unbound", "changed"] as const) expect(filterSections(s, f, o).map((x) => x.id), f).toEqual(["s2"]);
  });
  it("a section whose bindings.checks is not a list is unbound and has nothing to name on removal", () => {
    const odd = sec("s9", { heading: "9. Odd", bindings: { checks: "x" } as never });
    expect(removeQuestion(odd, {})).toBe('Remove "9. Odd"? Its text and parts go with it.');
    expect(filterSections([odd, sec("s1", { bindings: bound })], "unbound", { me: "", comments: [], ex: null, changed: new Set() }).map((x) => x.id)).toEqual(["s9"]);
  });
  it("Mine with nobody signed in matches nothing", () =>
    expect(filterSections([sec("s1")], "mine", { me: "", comments: [], ex: null, changed: new Set() })).toEqual([]));
  it("removeQuestion names the checks that stop", () => {
    expect(removeQuestion(sec("s1", { heading: "5. CDE and workflow", bindings: bound }), { "cde.states": "CDE states used" }))
      .toBe('Remove "5. CDE and workflow"? It is bound to these checks, which will no longer be checked here: CDE states used, loin.levels.');
    expect(removeQuestion(sec("s2", { heading: "9. Software" }), {})).toBe('Remove "9. Software"? Its text and parts go with it.');
  });
  it("answersLine", () => {
    expect(answersLine(doc({ responds_to: "e1", responds_to_version: 2 }), { title: "SNW EIR", version_no: 2 })).toBe("Answers: SNW EIR v2");
    expect(answersLine(doc({ responds_to: "e1" }), { title: "SNW EIR", version_no: null })).toBe("Answers: SNW EIR");
    expect(answersLine(doc({ responds_to: "e1" }), null)).toBe("Answers: an EIR of this project"); // the EIR's title is not loaded
    expect(answersLine(doc({ sections: [sec("s1", { blocks: [{ id: "s1.part-e", kind: "text", title: "", data: { markdown: "x" } }] })] }), null)).toBe("Answers: no EIR received");
    const fresh = doc({ template_id: "bep-comprehensive", sections: [sec("s1"), sec("s2", { template_key: "eir-response" })] });
    expect(answersLine(fresh, null)).toBe("Answers: start not picked yet");
    expect(answersLine(doc({ template_id: "bep-comprehensive" }), null)).toBe("Answers: no EIR linked"); // an ingested BEP: no eir-response section
    expect([isComprehensive(fresh), isComprehensive(doc({ template_id: "bep-comprehensive" })), isComprehensive({ ...fresh, template_id: "bep" })]).toEqual([true, false, false]);
    expect(answersLine(doc(), null)).toBe("Answers: no EIR linked");
    expect(answersLine(doc({ doc_type: "EIR" }), null)).toBeNull();
  });
});

const ACTIONS = ["Add section", "Rename", "Move up", "Move down", "Remove", "Section lead…"];
const version = (n: number): VersionListRow => ({ id: `v${n}`, version_no: n, label: `Label ${n}`, published_by: "a@x", published_at: "2026-10-22T10:00:00Z", revision: null, stage: null, suitability: null, sha: null });
let seq = 0; // the pane keeps its filter per document id, so each test gets its own
function ctx(canGovern: boolean, o: { focused?: string | null; versions?: VersionListRow[]; comments?: CommentRow[]; get?: unknown; d?: DocRow } = {}) {
  const st = { ...emptyState("k"), doc: { ...(o.d ?? doc()), id: `d${++seq}` }, role: canGovern ? "lead" : "viewer", me: "lead@x.com", versions: o.versions ?? [], comments: o.comments ?? [], message: "" };
  const write = vi.fn(async () => doc());
  const refresh = vi.fn();
  const ws = { write, get: vi.fn((o.get as any) ?? (async () => ({ checks: [], planned: [] }))), state: () => st };
  return { ws, st, doc: fakeDocument(), base: "", canEdit: canGovern, canGovern, focused: o.focused === undefined ? "s1" : o.focused,
    focus: vi.fn(), show: vi.fn(), refresh, openDoc: vi.fn() } as any;
}
const live = (focused: string | null) => ctx(true, { focused });
const tick = () => new Promise((r) => setTimeout(r, 0));
const labelled = (el: HTMLElement, label: string) => findAll(el, "button").find((b) => textOf(b) === label)!;
async function press(c: any, label: string) { click(labelled(outlinePane(c), label)); await tick(); await tick(); return c.ws.write; }

describe("outlinePane", () => {
  it("a viewer sees the outline and no section action (Review Focus 4)", () => {
    const el = outlinePane(ctx(false));
    expect(textOf(el)).toContain("H s1"); expect(textOf(el)).toContain("Draft, S0"); expect(textOf(el)).toContain("No version yet");
    expect(findAll(el, "button").map(textOf).filter((t) => ACTIONS.includes(t))).toEqual([]);
  });
  it("a lead sees the section actions", () => {
    const labels = findAll(outlinePane(ctx(true)), "button").map(textOf);
    for (const a of ACTIONS) expect(labels, a).toContain(a);
  });
  it("the head offers Link an EIR… to a lead on a BEP with a start still to pick", () => {
    const d = doc({ template_id: "bep-comprehensive", sections: [sec("s1"), sec("s2", { template_key: "eir-response" })] });
    expect(findAll(outlinePane(ctx(true, { d })), "button").map(textOf)).toContain("Link an EIR…");
    expect(findAll(outlinePane(ctx(false, { d })), "button").map(textOf)).not.toContain("Link an EIR…");
    expect(findAll(outlinePane(ctx(true)), "button").map(textOf)).not.toContain("Link an EIR…");
  });
  it("the head names the stage, the latest version and what the BEP answers", () => {
    const t = textOf(outlinePane(ctx(true, { versions: [version(1), version(2)] })));
    expect(t).toContain("Pre-appointment (tender)"); expect(t).toContain("v2, Label 2"); expect(t).toContain("Answers: no EIR linked");
  });
  it("Add with nothing focused appends; Move up sends the order; Remove confirms the bound checks", async () => {
    expect(await press(live(null), "Add section")).toHaveBeenCalledWith("POST", "/section", { heading: "New heading" });
    expect(await press(live("s2"), "Move up")).toHaveBeenCalledWith("PUT", "/outline", { order: ["s2", "s1"] });
    expect(await press(live("s1"), "Remove")).toHaveBeenCalledWith("POST", "/section/s1/remove", { confirm_bound: true });
  });
  it("Add with a section focused goes after it; Rename and Section lead use the section's path", async () => {
    expect(await press(live("s1"), "Add section")).toHaveBeenCalledWith("POST", "/section", { heading: "New heading", after: "s1" });
    expect(await press(live("s1"), "Rename")).toHaveBeenCalledWith("PUT", "/section/s1/heading", { heading: "New heading" });
    vi.mocked(askText).mockResolvedValueOnce("");
    expect(await press(live("s1"), "Section lead…")).toHaveBeenCalledWith("PATCH", "/section/s1", { owner: null });
  });
  it("a stored null section does not stop Move; the order leaves it out", async () => {
    const c = ctx(true, { focused: "s2", d: doc({ sections: [null as never, sec("s1"), sec("s2")] }) });
    expect(await press(c, "Move up")).toHaveBeenCalledWith("PUT", "/outline", { order: ["s2", "s1"] });
  });
  it("a section id in a path is encoded", async () => {
    const d = doc({ sections: [sec("a/b?c")] });
    const c = ctx(true, { focused: "a/b?c", d });
    expect(await press(c, "Rename")).toHaveBeenCalledWith("PUT", "/section/a%2Fb%3Fc/heading", { heading: "New heading" });
  });
  it("Cancel, an empty heading and a refused question send nothing; Move at the edge sends nothing", async () => {
    vi.mocked(askText).mockResolvedValueOnce(null);
    expect(await press(live(null), "Add section")).not.toHaveBeenCalled();
    vi.mocked(askText).mockResolvedValueOnce("");
    expect(await press(live("s1"), "Rename")).not.toHaveBeenCalled();
    vi.mocked(askText).mockResolvedValueOnce(null);
    expect(await press(live("s1"), "Section lead…")).not.toHaveBeenCalled();
    vi.mocked(askYesNo).mockResolvedValueOnce(false);
    expect(await press(live("s1"), "Remove")).not.toHaveBeenCalled();
    expect(await press(live("s1"), "Move up")).not.toHaveBeenCalled();
    expect(await press(live("s2"), "Move down")).not.toHaveBeenCalled();
  });
  it("an action that needs a section says so when none is picked", async () => {
    const c = live(null);
    expect(await press(c, "Rename")).not.toHaveBeenCalled();
    expect(textOf(outlinePane(c))).not.toContain("Pick a section in the outline first.");
    const el = outlinePane(c); click(labelled(el, "Rename")); await tick();
    expect(textOf(el)).toContain("Pick a section in the outline first.");
  });
  it("Remove names the checks by their label, read once", async () => {
    const c = ctx(true, { get: async () => ({ checks: [{ id: "cde.states", label: "CDE states used" }], planned: [] }) });
    await press(c, "Remove");
    expect(vi.mocked(askYesNo)).toHaveBeenLastCalledWith(expect.stringContaining("CDE states used, loin.levels."), { ok: "Remove", doc: c.doc });
  });
  it("a refused write shows the controller's message and does not redraw", async () => {
    const c = live("s1"); c.ws.write.mockResolvedValueOnce(null); c.st.message = "Nothing was saved.";
    const el = outlinePane(c); click(labelled(el, "Rename")); await tick(); await tick();
    expect(c.refresh).not.toHaveBeenCalled(); expect(textOf(el)).toContain("Nothing was saved.");
    expect(await press(live("s1"), "Rename")).toHaveBeenCalled();
  });
  it("a click on a row focuses it", () => {
    const c = live(null), el = outlinePane(c);
    click(findAll(el, "button").find((b) => textOf(b).includes("H s2"))!);
    expect(c.focus).toHaveBeenCalledWith("s2");
  });
  it("Changed asks for a version, reads it through the controller and lists what changed", async () => {
    const snap = doc({ sections: [sec("s1", { owner: "Lead@X.com", bindings: bound }), sec("s2", { body: "old" })] });
    const c = ctx(true, { versions: [version(1)], get: async () => ({ version_no: 1, snapshot: snap }), d: doc({ sections: [snap.sections[0], sec("s2", { body: "new" })] }) });
    vi.mocked(askText).mockResolvedValueOnce("1");
    const el = outlinePane(c); click(labelled(el, "Changed")); await tick(); await tick();
    expect(readVersion).toHaveBeenLastCalledWith(c, 1);
    expect(c.ws.get).toHaveBeenCalledWith(`/bimdocs/k/${c.st.doc.id}/versions/1`);
    const rows = findAll(el, "button").map(textOf).filter((t) => t.includes("H s"));
    expect(rows).toHaveLength(1); expect(rows[0]).toContain("H s2");
    expect(textOf(el)).toContain("Changed since v1");
  });
  it("Changed is worked out at every draw: a section edited after the pick appears, one edited back disappears", async () => {
    const v1 = [sec("s1", { body: "a" }), sec("s2", { body: "b" })];
    const c = ctx(true, { versions: [version(1)], get: async () => ({ version_no: 1, snapshot: doc({ sections: v1 }) }), d: doc({ sections: [sec("s1", { body: "a" }), sec("s2", { body: "edited" })] }) });
    vi.mocked(askText).mockResolvedValueOnce("1");
    click(labelled(outlinePane(c), "Changed")); await tick(); await tick();
    const ids = () => findAll(outlinePane(c), "button").map(textOf).filter((t) => t.includes("H s")).map((t) => t.match(/H (s\d)/)![1]);
    expect(ids()).toEqual(["s2"]);
    c.st.doc = { ...c.st.doc, sections: [sec("s1", { body: "edited later" }), sec("s2", { body: "b" })] }; // s1 edited, s2 edited back
    expect(ids()).toEqual(["s1"]);
    expect(textOf(outlinePane(c))).toContain("Changed since v1");
  });
  it("Changed with no version says so and asks nothing; an unknown number says so", async () => {
    vi.mocked(askText).mockClear();
    const el = outlinePane(live("s1")); click(labelled(el, "Changed")); await tick();
    expect(textOf(el)).toContain("No version yet to compare with."); expect(askText).not.toHaveBeenCalled();
    const c = ctx(true, { versions: [version(1)] });
    vi.mocked(askText).mockResolvedValueOnce("7");
    const el2 = outlinePane(c); click(labelled(el2, "Changed")); await tick(); await tick();
    expect(textOf(el2)).toContain("There is no such version."); expect(c.ws.get).not.toHaveBeenCalled();
  });
  it("Mine and Unbound filter the rows", () => {
    const c = ctx(true), el = outlinePane(c);
    click(labelled(el, "Mine"));
    expect(findAll(el, "button").map(textOf).filter((t) => t.includes("H s"))).toHaveLength(1);
    click(labelled(el, "Unbound"));
    const rows = findAll(el, "button").map(textOf).filter((t) => t.includes("H s"));
    expect(rows).toHaveLength(1); expect(rows[0]).toContain("H s2");
  });
  it("the document with no sections matching a filter says so", () => {
    const el = outlinePane(ctx(true, { d: doc({ sections: [sec("s1", { bindings: bound })] }) })); click(labelled(el, "Unbound"));
    expect(textOf(el)).toContain("No section matches.");
  });
});

describe("commentsTab", () => {
  it("asks for a section first", () => {
    const t = textOf(commentsTab(ctx(true, { focused: null })));
    expect(t).toContain("Pick a section in the outline to see its comments."); expect(t).toContain("Add comments in the Documents tab for now.");
  });
  it("lists the section's comments oldest first, nobody else's", () => {
    const t = textOf(commentsTab(ctx(true, { focused: "s1", comments: [
      comment("s1", { id: "b", author: "late@x", text: "second", created_at: "2026-10-25T11:00:00Z" }),
      comment("s1", { id: "a", author: "early@x", text: "first", created_at: "2026-10-24T11:00:00Z" }),
      comment("s2", { text: "elsewhere" })] })));
    expect(t.indexOf("early@x · 2026-10-24")).toBeGreaterThanOrEqual(0);
    expect(t.indexOf("first")).toBeLessThan(t.indexOf("second")); expect(t).not.toContain("elsewhere");
    expect(t).toContain("Add comments in the Documents tab for now.");
  });
  it("says so when the section has none", () => expect(textOf(commentsTab(ctx(true, { focused: "s1" })))).toContain("No comments on this section."));
});
