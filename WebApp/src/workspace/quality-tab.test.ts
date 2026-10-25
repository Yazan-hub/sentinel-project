import { describe, it, expect, vi } from "vitest";

vi.mock("../setups/bridge-fetch", () => ({ bfetch: vi.fn(async () => { throw new Error("offline"); }) }));
// The real picker builds with the global document and Option; a node test gets an empty span from a fake document instead.
vi.mock("../setups/ai-picker", async () => {
  const { fakeDocument } = await import("./fake-dom");
  return { aiBody: () => ({ provider: "local" }), aiPicker: () => fakeDocument().createElement("span") };
});

import { bindingsBody, qualityModel, qualityTab } from "./quality-tab";
import { fakeDocument, findAll, textOf, click } from "./fake-dom";

const s = (section_id: string, heading: string, o: Record<string, unknown>) => ({ section_id, heading, kind: "narrative", controlling_checks: [], declared_checks: [], unknown_checks: [], owner: null, has_body: true, written: true, ...o });
const ex = { score: 20, headline: "20 % controlling, 3 of 5 sections written", variant: "full", strip: [],
  summary: { sections: 5, controlling: 1, declared: 2, narrative: 2, unowned: 5, empty: 2, written: 3 },
  sections: [s("s1", "3. Roles", { kind: "controlling", controlling_checks: ["roles.responsibility"] }), s("s2", "5. Federation", { kind: "declared", declared_checks: ["federation.breakdown"] }),
    s("s3", "6. CDE", { kind: "declared", controlling_checks: ["cde.states"], written: false, has_body: false }), s("s4", "10. Software", { written: false, has_body: false }),
    s("s5", "11. QA", { unknown_checks: ["qa.old"] })] } as any;
const compliance = { sections: [
  { section_id: "s1", results: [{ id: "roles.responsibility", label: "Roles", status: "violations", count: 3, summary: "3 rows", evidence: [] }] },
  { section_id: "s3", results: [{ id: "cde.states", label: "CDE", status: "met", count: 0, summary: "", evidence: [] }] }] };
const checks = { checks: [{ id: "roles.responsibility", label: "Every role has a responsibility" }, { id: "cde.states", label: "CDE states in use" }],
  planned: [{ id: "federation.breakdown", label: "Federation breakdown", reason: "Needs the model breakdown." }] };

describe("qualityModel", () => {
  it("keeps the bridge's headline and names every kind of section in words", () => {
    expect(qualityModel(ex, compliance, checks)).toEqual({
      headline: "20 % controlling, 3 of 5 sections written", variant: "Full variant",
      bound: [{ section_id: "s1", heading: "3. Roles", lines: ["Every role has a responsibility: 3 problems"] }, { section_id: "s3", heading: "6. CDE", lines: ["CDE states in use: met"] }],
      unwritten: ["6. CDE"],
      unbound: ["10. Software"],
      planned: ["Federation breakdown (planned): Needs the model breakdown. Bound on 5. Federation."],
      unknown: ["11. QA: qa.old is not a check Sentinel knows; it is not counted."],
    });
  });
  it("reads no results from an odd compliance answer, and no variant when the bridge has none", () => {
    const m = qualityModel({ ...ex, variant: null }, "nope", checks);
    expect(m.variant).toBeNull();
    expect(m.bound[0].lines).toEqual(["Every role has a responsibility: not run"]);
  });
  it("words one problem, a check that cannot run and an error", () => {
    const c = { sections: [{ section_id: "s1", results: [{ id: "roles.responsibility", status: "violations", count: 1, summary: "" }] },
      { section_id: "s3", results: [{ id: "cde.states", status: "not_checkable", count: 0, summary: "s", reason: "no CDE yet" }] }] };
    const m = qualityModel(ex, c, checks);
    expect(m.bound.map((b) => b.lines)).toEqual([["Every role has a responsibility: 1 problem"], ["CDE states in use: not checkable: no CDE yet"]]);
    const e = qualityModel(ex, { sections: [{ section_id: "s3", results: [{ id: "cde.states", status: "error", summary: "boom" }] }] }, { checks: [], planned: [] });
    expect(e.bound[1].lines).toEqual(["cde.states: error: boom"]);
  });
});

describe("bindingsBody", () => {
  it("keeps stored params of kept checks and reads an odd stored value as none", () => {
    expect(bindingsBody([{ id: "cde.states", params: { states: 4 } }, { id: "gate.stage" }], ["cde.states", "naming.containers"]))
      .toEqual({ checks: [{ id: "cde.states", params: { states: 4 } }, { id: "naming.containers" }] });
    expect(bindingsBody({ checks: "x" }, ["gate.stage"])).toEqual({ checks: [{ id: "gate.stage" }] });
  });
});

// ---- the tab ----
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const docRow = { id: "d1", doc_type: "BEP", title: "T", status: "wip", updated_at: "t1", sections: [
  { id: "s1", heading: "3. Roles", bindings: { checks: [{ id: "roles.responsibility", params: { a: 1 } }] } }, { id: "s4", heading: "10. Software", bindings: {} }] };
function ctxWith(o: { canGovern?: boolean; canEdit?: boolean; get?: any; post?: any; write?: any; message?: string; nowKey?: string } = {}) {
  const st = { key: "snowdon", doc: docRow, versions: [], comments: [], ex, role: "lead", me: "l@x", problems: [], message: "", viewing: null, respondsTo: null };
  const now = { ...st, key: o.nowKey ?? "snowdon", message: o.message ?? "" };
  const get = o.get ?? vi.fn(async (p: string) => (p.endsWith("/checks") ? checks : p.endsWith("/compliance") ? compliance : null));
  return { st, doc: fakeDocument(), base: "http://b", canEdit: o.canEdit ?? true, canGovern: o.canGovern ?? true, focused: null, focus: vi.fn(), show: vi.fn(), refresh: vi.fn(), openDoc: vi.fn(),
    ws: { state: vi.fn(() => now), get, post: o.post ?? vi.fn(async () => null), write: o.write ?? vi.fn(async () => null), reload: vi.fn(async () => {}), rescore: vi.fn(), open: vi.fn(), viewVersion: vi.fn() } } as any;
}
const button = (el: HTMLElement, label: string) => findAll(el, "button").find((b) => textOf(b) === label);
const ticks = (root: HTMLElement) => findAll(root, "input").filter((i: any) => i.attrs.get("type") === "checkbox") as any[];

describe("qualityTab", () => {
  it("shows the headline, the variant and the lists from the bridge's answers", async () => {
    const root = qualityTab(ctxWith());
    await flush();
    const t = textOf(root);
    expect(t).toContain("20 % controlling, 3 of 5 sections written");
    expect(t).toContain("Full variant");
    expect(t).toContain("Every role has a responsibility: 3 problems");
    expect(t).toContain("Bound but not written");
    expect(t).toContain("11. QA: qa.old is not a check Sentinel knows; it is not counted.");
  });
  it("reads the headline from the state each time it is built", () => {
    const c = ctxWith();
    expect(textOf(qualityTab(c))).toContain("20 %");
    c.st.ex = { ...ex, headline: "40 % controlling, 6 of 10 sections written" };
    expect(textOf(qualityTab(c))).toContain("40 % controlling");
  });
  it("shows a viewer no governing or editing buttons", async () => {
    const root = qualityTab(ctxWith({ canGovern: false, canEdit: false }));
    await flush();
    expect(button(root, "Suggest bindings…")).toBeUndefined();
    expect(button(root, "Bindings…")).toBeUndefined();
    expect(button(root, "Integrity check")).toBeUndefined();
  });
  it("Apply selected writes only sections that change, keeping stored params, then reloads and says how many", async () => {
    const sugg = [{ section_id: "s1", heading: "3. Roles", suggested: [{ id: "roles.responsibility", label: "Roles", params: {}, confidence: 1, why: "w", planned: false },
      { id: "federation.breakdown", label: "Federation", params: {}, confidence: 1, why: "w", planned: true }] },
      { section_id: "s4", heading: "10. Software", suggested: [{ id: "cde.states", label: "CDE", params: { expect: ["published"] }, confidence: 1, why: "w", planned: false },
        { id: "gate.stage", label: "Gate", params: {}, confidence: 0.8, why: "w", planned: false }] }];
    const write = vi.fn(async () => docRow);
    const c = ctxWith({ post: vi.fn(async () => sugg), write });
    const root = qualityTab(c);
    await flush();
    click(button(root, "Suggest bindings…")!);
    await flush();
    expect(c.ws.post).toHaveBeenCalledWith("/bimdocs/snowdon/d1/bindings/suggest", {});
    expect(ticks(root).map((b) => b.checked)).toEqual([true, false, true, false]); // planned and low confidence start unticked
    expect(textOf(root)).toContain("(planned, not checkable yet)");
    click(button(root, "Apply selected")!);
    await flush();
    expect(write).toHaveBeenCalledTimes(1); // 3. Roles already has what is ticked: no write
    expect(write).toHaveBeenCalledWith("PUT", "/section/s4/bindings", { bindings: { checks: [{ id: "cde.states", params: { expect: ["published"] } }] } });
    expect(c.ws.reload).toHaveBeenCalled();
    expect(textOf(root)).toContain("Applied 1 of 1.");
  });
  it("adding a new check to a section that has bindings keeps the old ones with their params", async () => {
    const sugg = [{ section_id: "s1", heading: "3. Roles", suggested: [{ id: "cde.states", label: "CDE", params: { expect: ["published"] }, confidence: 1, why: "w", planned: false }] }];
    const write = vi.fn(async () => docRow);
    const c = ctxWith({ post: vi.fn(async () => sugg), write });
    const root = qualityTab(c);
    await flush();
    click(button(root, "Suggest bindings…")!);
    await flush();
    click(button(root, "Apply selected")!);
    await flush();
    expect(write).toHaveBeenCalledWith("PUT", "/section/s1/bindings", { bindings: { checks: [{ id: "roles.responsibility", params: { a: 1 } }, { id: "cde.states", params: { expect: ["published"] } }] } });
  });
  it("a section holding a check Sentinel does not know is skipped with a line, and the next section is still written", async () => {
    const odd = { ...docRow, sections: [{ id: "s1", heading: "3. Roles", bindings: { checks: [{ id: "qa.old" }] } }, docRow.sections[1]] };
    const sugg = [{ section_id: "s1", heading: "3. Roles", suggested: [{ id: "cde.states", label: "CDE", params: {}, confidence: 1, why: "w", planned: false }] },
      { section_id: "s4", heading: "10. Software", suggested: [{ id: "cde.states", label: "CDE", params: {}, confidence: 1, why: "w", planned: false }] }];
    const write = vi.fn(async () => odd);
    const c = ctxWith({ post: vi.fn(async () => sugg), write });
    c.ws.state = vi.fn(() => ({ ...c.st, doc: odd }));
    const root = qualityTab(c);
    await flush();
    click(button(root, "Suggest bindings…")!);
    await flush();
    click(button(root, "Apply selected")!);
    await flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("PUT", "/section/s4/bindings", { bindings: { checks: [{ id: "cde.states" }] } });
    expect(textOf(root)).toContain("Applied 1 of 2.");
    expect(textOf(root)).toContain("3. Roles: holds a check Sentinel does not know (qa.old); remove it in Bindings… first.");
  });
  it("a refusal on one section does not stop the next; a partial apply still reloads and says both", async () => {
    const sugg = [{ section_id: "s1", heading: "3. Roles", suggested: [{ id: "cde.states", label: "CDE", params: {}, confidence: 1, why: "w", planned: false }] },
      { section_id: "s4", heading: "10. Software", suggested: [{ id: "cde.states", label: "CDE", params: {}, confidence: 1, why: "w", planned: false }] }];
    const write = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(docRow);
    const c = ctxWith({ post: vi.fn(async () => sugg), write, message: "unknown check id x. Nothing was saved." });
    const root = qualityTab(c);
    await flush();
    click(button(root, "Suggest bindings…")!);
    await flush();
    click(button(root, "Apply selected")!);
    await flush();
    expect(write).toHaveBeenCalledTimes(2);
    expect(c.ws.reload).toHaveBeenCalled();
    expect(textOf(root)).toContain("Applied 1 of 2.");
    expect(textOf(root)).toContain("3. Roles: unknown check id x. Nothing was saved.");
  });
  it("the Applied note survives a real rebuild once, and only for its own document", async () => {
    const sugg = [{ section_id: "s4", heading: "10. Software", suggested: [{ id: "cde.states", label: "CDE", params: {}, confidence: 1, why: "w", planned: false }] }];
    const c = ctxWith({ post: vi.fn(async () => sugg), write: vi.fn(async () => docRow) });
    const other = ctxWith();
    other.st.doc = { ...docRow, id: "d2" };
    const rebuilt: HTMLElement[] = [];
    c.ws.reload = vi.fn(async () => { rebuilt.push(qualityTab(other), qualityTab(c), qualityTab(c)); }); // another document's tab, then this one's, then a later one
    const root = qualityTab(c);
    await flush();
    click(button(root, "Suggest bindings…")!);
    await flush();
    click(button(root, "Apply selected")!);
    await flush();
    expect(textOf(rebuilt[0])).not.toContain("Applied");
    expect(textOf(rebuilt[1])).toContain("Applied 1 of 1.");
    expect(textOf(rebuilt[2])).not.toContain("Applied");
  });
  it("a failed check-list read is not an empty list: the lists say so once, Bindings… offers no Save, Suggest refuses", async () => {
    const get = vi.fn(async (p: string) => (p.endsWith("/compliance") ? compliance : null));
    const post = vi.fn(async () => []);
    const c = ctxWith({ get, post });
    const root = qualityTab(c);
    await flush();
    expect(textOf(root).split("The check list could not be read.").length - 1).toBe(1);
    click(button(root, "Bindings…")!);
    await flush();
    expect(button(root, "Save bindings")).toBeUndefined();
    expect(ticks(root)).toHaveLength(0);
    click(button(root, "Suggest bindings…")!);
    await flush();
    expect(post).not.toHaveBeenCalled();
    expect(button(root, "Apply selected")).toBeUndefined();
  });
  it("Bindings… shows an unknown stored check ticked with its caption, and unticking removes it from the save", async () => {
    const odd = { ...docRow, sections: [{ id: "s1", heading: "3. Roles", bindings: { checks: [{ id: "roles.responsibility", params: { a: 1 } }, { id: "qa.old" }] } }, docRow.sections[1]] };
    const write = vi.fn(async () => odd);
    const c = ctxWith({ write });
    c.ws.state = vi.fn(() => ({ ...c.st, doc: odd }));
    const root = qualityTab(c);
    await flush();
    click(button(root, "Bindings…")!);
    await flush();
    expect(ticks(root).map((b) => b.checked)).toEqual([true, false, false, true]);
    expect(textOf(root)).toContain("Untick it to remove it; saving is refused while it stays.");
    ticks(root)[3].checked = false;
    click(button(root, "Save bindings")!);
    await flush();
    expect(write).toHaveBeenCalledWith("PUT", "/section/s1/bindings", { bindings: { checks: [{ id: "roles.responsibility", params: { a: 1 } }] } });
  });
  it("a refused write stops, says the bridge's words and still reports the count", async () => {
    const sugg = [{ section_id: "s4", heading: "10. Software", suggested: [{ id: "cde.states", label: "CDE", params: {}, confidence: 1, why: "w", planned: false }] }];
    const c = ctxWith({ post: vi.fn(async () => sugg), message: "Only a lead can do this. Nothing was saved." });
    const root = qualityTab(c);
    await flush();
    click(button(root, "Suggest bindings…")!);
    await flush();
    click(button(root, "Apply selected")!);
    await flush();
    expect(textOf(root)).toContain("Applied 0 of 1.");
    expect(textOf(root)).toContain("Only a lead can do this. Nothing was saved.");
    expect(c.ws.reload).not.toHaveBeenCalled();
  });
  it("Bindings… saves the ticked checks through bindingsBody", async () => {
    const write = vi.fn(async () => docRow);
    const c = ctxWith({ write });
    const root = qualityTab(c);
    await flush();
    click(button(root, "Bindings…")!); // the first section, 3. Roles
    await flush();
    expect(ticks(root).map((b) => b.checked)).toEqual([true, false, false]);
    ticks(root)[1].checked = true;
    click(button(root, "Save bindings")!);
    await flush();
    expect(write).toHaveBeenCalledWith("PUT", "/section/s1/bindings", { bindings: { checks: [{ id: "roles.responsibility", params: { a: 1 } }, { id: "cde.states" }] } });
    expect(c.ws.reload).toHaveBeenCalled();
  });
  it("Integrity check shows the cards as text under the AI banner, the note, and the discarded count", async () => {
    const post = vi.fn(async () => ({ findings: [{ section_id: "s1", claim: "<b>All S4</b>", reality: "Only S2", severity: "high" }], dropped: 2, grounding_used: 4, generated_at: "t", note: "Short doc." }));
    const c = ctxWith({ post });
    const root = qualityTab(c);
    await flush();
    click(button(root, "Integrity check")!);
    await flush();
    expect(post).toHaveBeenCalledWith("/bimdocs/snowdon/d1/integrity", { provider: "local" });
    const t = textOf(root);
    expect(t).toContain("AI analysis: suggestions, not compliance facts");
    expect(t).toContain("Document: <b>All S4</b>");
    expect(t).toContain("Reality: Only S2");
    expect(t).toContain("Short doc.");
    expect(t).toContain("2 finding(s) discarded: the model cited no grounded fact for them.");
  });
  it("a stale answer shows nothing", async () => {
    const c = ctxWith({ post: vi.fn(async () => null), message: "old project's words", nowKey: "other" });
    const root = qualityTab(c);
    await flush();
    click(button(root, "Integrity check")!);
    await flush();
    expect(textOf(root)).not.toContain("old project's words");
  });
});
