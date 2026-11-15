import { describe, it, expect, vi } from "vitest";

vi.mock("../setups/bridge-fetch", () => ({ bfetch: vi.fn() }));
vi.mock("../setups/active-ruleset", () => ({ artefactInForce: vi.fn(async () => ({ sha256: "ab12", body: {} })), installArtefact: vi.fn(async () => ({ kind: "ids", version: 4, sha256: "cd" })) }));

import { artefactInForce, installArtefact } from "../setups/active-ruleset";
import { loinCompile, loinLines } from "./loin-compile";
import { emptyState } from "./workspace-state";
import { click, fakeDocument, findAll, textOf } from "./fake-dom";

const tick = () => new Promise((r) => setTimeout(r, 0));
const rows = [{ id: "r1", element: "Walls", milestone: "Stage 3", property: "Pset_WallCommon.FireRating", value: "REI 60", used_by: "", why: "" },
  { id: "r2", element: "Widgets", milestone: "Stage 3", property: "X", value: "", used_by: "", why: "" }];
const lead = (extra: Record<string, unknown> = {}) => ({ ...emptyState("k"), doc: { id: "d1", doc_type: "BEP", title: "My BEP", sections: [] } as any, role: "lead", me: "lead@x", ...extra });
function pane(post: any, st: any = lead()) {
  return { ws: { post, state: () => st }, st, doc: fakeDocument(), base: "http://b", canEdit: true, canGovern: true, focused: null, focus: vi.fn(), show: vi.fn(), refresh: vi.fn(), openDoc: vi.fn() } as any;
}
const press = async (el: HTMLElement, label: string) => { click(findAll(el, "button").find((b) => textOf(b) === label)!); await tick(); await tick(); };
const answer = { ids: { title: "t", specifications: [{}] }, added: 1, kept: 2, skipped: [], unmatched: [{ row: rows[1], reason: 'No IFC class is known for "Widgets".' }], xml: "<ids/>" };

describe("loinLines", () => {
  it("counts, then names each row that was not mapped with its reason", () => {
    expect(loinLines(answer, rows)).toEqual(["1 added, 2 kept, 1 not mapped", 'Row 2: No IFC class is known for "Widgets".']);
    expect(loinLines({ ...answer, unmatched: [{ row: 1, reason: "r" }] }, rows)[1]).toBe("Row 1: r");
  });
});

describe("loinCompile", () => {
  it("compiles the rows, shows the counts and installs with If-Match", async () => {
    const post = vi.fn(async () => answer), ctx = pane(post), el = loinCompile(ctx, rows as any);
    await press(el, "Compile to IDS");
    expect(post).toHaveBeenCalledWith("/cde/k/artefacts/ids/loin", { rows, title: "My BEP, level of information need" });
    expect(textOf(el)).toContain("1 added, 2 kept, 1 not mapped");
    await press(el, "Install as the project's IDS");
    expect(installArtefact).toHaveBeenCalledWith("http://b", "k", "ids", expect.objectContaining({ title: "t", source: expect.objectContaining({ document_id: "d1" }) }), "lead@x", "ab12");
    expect(textOf(el)).toContain("Installed ids@4 on k.");
  });
  it("review finding 16a: names a row the IDS already requires; offers the install when only earlier LOIN specifications would go", async () => {
    expect(loinLines({ added: 0, kept: 2, unmatched: [], already: [{ row: 1, by: "Walls fire" }] }, rows))
      .toEqual(["0 added, 2 kept, 0 not mapped, 1 already required", 'Row 1: already required by "Walls fire", so it is not checked twice']);
    const post = vi.fn(async () => ({ ids: { title: "t", specifications: [] }, added: 0, kept: 2, replaced: 2, unmatched: [] })), el = loinCompile(pane(post), [] as any);
    await press(el, "Compile to IDS");
    expect(textOf(el)).toContain("No row adds a specification. Installing takes the 2 earlier level-of-information-need specifications out of the IDS.");
    await press(el, "Install as the project's IDS");
    expect(textOf(el)).toContain("Installed ids@4 on k.");
    const none = loinCompile(pane(vi.fn(async () => ({ ids: {}, added: 0, kept: 2, replaced: 0, unmatched: [], already: [{ row: 1, by: "x" }] }))), rows as any);
    await press(none, "Compile to IDS");
    expect(textOf(none)).toContain("Nothing to install: the IDS in force already requires every row.");
    expect(findAll(none, "button").some((b) => textOf(b) === "Install as the project's IDS")).toBe(false);
  });
  it("installs nothing when no row mapped", async () => {
    const post = vi.fn(async () => ({ ...answer, added: 0, unmatched: [{ row: 1, reason: "r" }, { row: 2, reason: "r" }] })), el = loinCompile(pane(post), rows as any);
    await press(el, "Compile to IDS");
    expect(textOf(el)).toContain("Nothing to install: no row could be mapped.");
    expect(findAll(el, "button").some((b) => textOf(b) === "Install as the project's IDS")).toBe(false);
  });
  it("a 412 says the IDS changed and installs nothing; below lead there is no install", async () => {
    vi.mocked(installArtefact).mockRejectedValueOnce(Object.assign(new Error("x"), { status: 412 }));
    const el = loinCompile(pane(vi.fn(async () => answer)), rows as any);
    await press(el, "Compile to IDS"); await press(el, "Install as the project's IDS");
    expect(textOf(el)).toContain("The IDS in force changed while you looked; compile again. Nothing was installed.");
    const other = loinCompile(pane(vi.fn(async () => answer), lead({ role: "contributor" })), rows as any);
    await press(other, "Compile to IDS");
    expect(findAll(other, "button").some((b) => textOf(b) === "Install as the project's IDS")).toBe(false);
  });
  it("a refused compile shows the bridge's words; rows may be a function read at the click", async () => {
    const post = vi.fn(async () => null), ctx = pane(post, lead({ message: "Nope." })), el = loinCompile(ctx, () => [rows[0]] as any);
    await press(el, "Compile to IDS");
    expect(textOf(el)).toContain("Nope.");
    expect((post.mock.calls as any)[0][1]).toMatchObject({ rows: [rows[0]] });
    expect(artefactInForce).toHaveBeenCalled();
  });
});
