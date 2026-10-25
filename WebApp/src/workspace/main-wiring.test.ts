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

describe("entry points (spec section 5)", () => {
  it("Documents, Deliverables and the Next strip open the workspace", () => {
    expect(main).toContain('const openWorkspace = (docId: string, at?: { section?: string; view?: View }) => { app.layout = "Workspace"; void workspaceEl.open(docId, at); };');
    expect(main).toContain("onOpenWorkspace: (id) => openWorkspace(id)"); // Task 17 adds onIngested to the same docsPanel options
    expect(main).toContain("deliverablesPanel(components, { baseUrl: SERVICE_URL, onOpenBep: () => void openBep() })");
    expect(main).toContain('if (label === "Workspace") return void openBep();');
    expect(main).toContain('openWorkspace(id, { section: "delivery-plans" })');
  });
  it("Deliverables offers Open in BEP", () =>
    expect(readFileSync(new URL("../setups/deliverables-panel.ts", import.meta.url), "utf8")).toContain('btn("Open in BEP")'));
});
describe("R1b hand-over wiring", () => {
  it("an upload in the old panel opens its review in the workspace", () =>
    expect(main).toContain('onIngested: (p) => { app.layout = "Workspace"; workspaceEl.openIngest(p); }'));
  it("leaving the Workspace layout (Back, the activity bar, any path) makes the old panel re-read what it shows", () => {
    expect(main).toContain("onLeave: () => docsEl.refresh()");
    expect(main).toContain("const docsEl = docsPanel("); // docsEl is read only when the person leaves, after it exists
  });
});
