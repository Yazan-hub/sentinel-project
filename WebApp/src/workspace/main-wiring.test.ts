import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const main = readFileSync(new URL("../main.ts", import.meta.url), "utf8");

describe("main.ts mounts the workspace (founder decision 2026-10-25, layout A; UX slice 2: a full-page overlay, not a sidebar icon)", () => {
  it("the editor is a full-page overlay over the shell, hidden until opened, under the switcher and account corner", () => {
    expect(main).toMatch(/import \{ workspacePage(, type View)? \} from "\.\/workspace\/workspace-page";/);
    expect(main).toContain('Object.assign(workspaceEl.style, { position: "fixed", inset: "0", height: "auto", zIndex: "20", display: "none" });');
    expect(main).toContain("container.appendChild(workspaceEl);");
    expect(main).not.toContain("workspace: () => BUI.html`${workspaceEl}`"); // never a layout element: the sidebar holds the five areas only
    expect(main).toContain('{ label: "Document editor", go: () => showWorkspace() }'); // the old icon's reopen-last-document, from Documents
  });
  it("Back closes the editor and leaves the person on the area they opened it from", () => expect(main).toContain("onBack: () => hideWorkspace()"));
  it("every jump to an area closes the editor first", () => expect(main).toContain("const go = (layout: string, group: HTMLElement, labels: string[], label: string) => { hideWorkspace(); app.layout = layout; showTabOf(group, labels, label); };"));
  it("the workspace exists before the panels that open it", () => expect(main.indexOf("const workspaceEl =")).toBeLessThan(main.indexOf("const docsEl =")));
});

describe("entry points (spec section 5)", () => {
  it("Documents, Deliverables and the Next strip open the workspace", () => {
    expect(main).toContain("const openWorkspace = (docId: string, at?: { section?: string; view?: View }) => { showWorkspace(); void workspaceEl.open(docId, at); };");
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
    expect(main).toContain("onIngested: (p) => { showWorkspace(); workspaceEl.openIngest(p); }"));
  it("leaving the Workspace layout (Back, the activity bar, any path) makes the old panel re-read what it shows", () => {
    expect(main).toContain("onLeave: () => docsEl.refresh()");
    expect(main).toContain("const docsEl = docsPanel("); // docsEl is read only when the person leaves, after it exists
  });
});
describe("R2c: My work opens a document from the Dashboard and from the workspace header", () => {
  it("the Dashboard and the workspace share one open-a-document callback and one Review desk opener", () => {
    expect(main).toContain("onOpenDoc: (id, at) => openWorkspace(id, at), onOpenReview: () => openReviewDesk() });");
    expect(main).toContain("onLeave: () => docsEl.refresh(), onOpenReview: () => openReviewDesk() });");
    expect(main).toContain('openReviewDesk = () => go("Documents", docsAreaEl, DOC_TABS, "Proposed changes");'); // UX slice 2: the desk is Documents ▸ Proposed changes
    expect(main).toContain('{ label: "Proposed changes", el: reviewEl },');
  });
  it("the Dashboard draws the My work card", () => {
    const shell = readFileSync(new URL("../setups/project-shell.ts", import.meta.url), "utf8");
    expect(shell).toContain('id="ps-work"'); expect(shell).toContain("My work (${myWorkTotal(w)})");
  });
});
describe("F-R1c-2: a project tab never grows past its panel", () => {
  it("the shown tab may shrink below its widest line, so its own bars wrap and its body scrolls", () =>
    expect(main).toContain('if (on) { t.el.style.flex = "1"; t.el.style.minHeight = "0"; t.el.style.minWidth = "0"; }'));
});
describe("F-R2c-1: My work follows the person signed in", () => {
  const page = readFileSync(new URL("./workspace-page.ts", import.meta.url), "utf8");
  it("a sign-in change re-reads the header's My work (main.ts sends it as a project refresh)", () => {
    expect(main).toContain("onAuthChange((session) => { if (userChanged(session)) refreshActiveProject(); });");
    expect(page).toContain("onActiveProjectChange(() => { work = null; workRead = false; drawWork(); if (activePid()) void loadWork(); });");
  });
});

