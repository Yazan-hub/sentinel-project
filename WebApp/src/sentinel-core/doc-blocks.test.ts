import { describe, it, expect } from "vitest";
import { oldPanelEditable, oldPanelSaveBody, OLD_PANEL_NOTE, statusLine } from "./doc-blocks";
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
