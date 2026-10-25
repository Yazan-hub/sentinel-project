import { describe, it, expect } from "vitest";
import { oldPanelEditable, oldPanelSaveBody, OLD_PANEL_NOTE, statusLine, blocksOf, BLOCK_NAMES } from "./doc-blocks";
// @ts-ignore the bridge module is plain JS
import { blocksOf as bridgeBlocksOf } from "../../bridge/doc-blocks.mjs";

describe("blocksOf (mirror of bridge/doc-blocks.mjs:231)", () => {
  it("equals the bridge on well-formed sections, a pre-0049 one included", () => {
    for (const s of [{ id: "s1", body: "x" }, { id: "s1" }, { id: "s1", body: "x", blocks: [] }, { id: "s1", blocks: [{ id: "b", kind: "text", title: "", data: { markdown: "m" } }] }])
      expect(blocksOf(s)).toEqual(bridgeBlocksOf(s));
  });
  it("reads odd stored shapes without throwing", () => {
    expect(blocksOf({ id: "s", body: 5 })).toEqual([{ id: "s.t0", kind: "text", title: "", data: { markdown: "" } }]);
    const ok = { id: "b", kind: "text", title: "", data: { markdown: "" } };
    expect(blocksOf({ id: "s", blocks: [null, 3, "x", [], ok] })).toEqual([ok]);
  });
  it("names every kind in plain words", () => expect(BLOCK_NAMES.matrix).toBe("Responsibility matrix"));
});
describe("oldPanelEditable", () => {
  it("text-only sections stay editable in the old panel", () => {
    expect(oldPanelEditable({})).toBe(true);
    expect(oldPanelEditable({ blocks: [] })).toBe(true);
    expect(oldPanelEditable({ blocks: [{ kind: "text" }] })).toBe(true);
    expect(oldPanelEditable({ blocks: [{ kind: "text", title: "" }] })).toBe(true);
  });
  it("any other block makes it read-only there, with the bridge's words", () => {
    expect(oldPanelEditable({ blocks: [{ kind: "text" }, { kind: "table" }] })).toBe(false);
    expect(oldPanelEditable({ blocks: [{ kind: "naming" }] })).toBe(false);
    expect(oldPanelEditable({ blocks: [{ kind: "text", title: "Intro" }] })).toBe(false);
    expect(OLD_PANEL_NOTE).toBe("This section has tables or other parts; edit it in the workspace.");
  });
});
describe("oldPanelSaveBody", () => {
  it("sends the text of a text-only section and nothing for any other", () => {
    expect(oldPanelSaveBody({ blocks: [{ kind: "text" }] }, "v")).toBe("v");
    expect(oldPanelSaveBody({}, "v")).toBe("v");
    expect(oldPanelSaveBody({ blocks: [{ kind: "text" }, { kind: "table" }] }, "v")).toBeUndefined();
  });
});
describe("statusLine", () => {
  it("plain status words with the suitability after a comma", () => {
    expect(statusLine({ status: "wip", suitability: "S0" })).toBe("Draft, S0");
    expect(statusLine({ status: "published", suitability: "A1" })).toBe("Published, A1");
    expect(statusLine({ status: "shared" })).toBe("Shared");
    expect(statusLine({ status: "odd" })).toBe("odd");
  });
});
