import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const main = readFileSync(new URL("../main.ts", import.meta.url), "utf8");

describe("main.ts mounts the workspace (founder decision 2026-10-25, layout A)", () => {
  it("the Workspace layout shows the workspace alone and keeps its activity-bar icon", () => {
    expect(main).toMatch(/import \{ workspacePage(, type View)? \} from "\.\/workspace\/workspace-page";/);
    expect(main).toContain("workspace: () => BUI.html`${workspaceEl}`,");
    expect(main).toContain('Workspace: { icon: "mdi:file-document-edit-outline", template: `"workspace" 1fr / 1fr` },');
  });
  it("Back returns to the project space, not the hub", () => expect(main).toContain('onBack: () => { app.layout = "Projects"; showSpace(); }'));
  it("the workspace exists before the panels that open it", () => expect(main.indexOf("const workspaceEl =")).toBeLessThan(main.indexOf("const docsEl =")));
});
