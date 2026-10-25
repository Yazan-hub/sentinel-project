// The BIM documents workspace page (layout A, founder 2026-10-25): a header, then outline | document | side tabs,
// each column scrolling on its own. The panes are slots (VIEWS, SIDE_TABS, OUTLINE) that later tasks fill.
import { bfetch } from "../setups/bridge-fetch";
import { loadScope } from "../setups/load-scope";
import { activePid, onActiveProjectChange } from "../setups/active-project";
import { myRoleRead } from "../setups/my-role";
import { currentUser } from "../setups/auth";
import { askYesNo } from "../setups/ask";
import { aiPicker } from "../setups/ai-picker";
import { statusLine, type DocRow } from "../sentinel-core/doc-blocks";
import { becameVisible, createWorkspace, reopenTarget, resolveSection, reviewLines, rightsOf, type Workspace, type WorkspaceState } from "./workspace-state";
import { C, btn, h } from "./dom";
import { editPane, type Carried, type EditorHandle, type EditPaneEl } from "./block-editors";
import { ingestView, type IngestProposal } from "./ingest-view";
import { commentsTab, outlinePane } from "./outline";
import { qualityTab } from "./quality-tab";
import { readinessView, READ_ONLY_NOTE } from "./readiness-view";
import { readView } from "./read-view";
import { startStrip } from "./start-strip";
import { compareView, versionsView } from "./versions-view";

export type View = "edit" | "read" | "compare" | "versions";
export interface PaneCtx { ws: Workspace; st: WorkspaceState; doc: Document; base: string; canEdit: boolean; canGovern: boolean;
  focused: string | null; focus(sectionId: string): void; show(view: View): void; refresh(part: "outline" | "side" | "all"): void;
  openDoc(docId: string): Promise<void> /* the page's own open: view reset, remembered as this project's last document */;
  /** Set by the edit view for the editors it opens: show this fresh row's version of one section without closing its open editors. */
  sectionApplied?(sectionId: string, fresh: DocRow): Promise<void>;
  /** For the Edit view: unsaved editors of this document carried over a redraw (block id → what was typed); each opens again with it. */
  drafts?: Map<string, Carried>;
  /** The open editor of this block in the Edit view on screen now (after a redraw, not the one that started a call); undefined when none. */
  editorOf?(blockId: string): EditorHandle | undefined }
export type WorkspaceEl = HTMLElement & { open(docId: string, at?: { section?: string; view?: View }): Promise<void>; openIngest(p: IngestProposal): void };

// Every view marks each section node with dataset.section = its id (PaneCtx.focus scrolls to it).
export const VIEWS: Record<View, (ctx: PaneCtx) => HTMLElement> = { edit: editPane, read: readView, compare: compareView, versions: versionsView };

const SIDE_TEXT = `color:${C.soft};font:12px system-ui;line-height:1.5;margin:0 0 .5rem`;
export const SIDE_TABS: Record<"quality" | "review" | "comments", (ctx: PaneCtx) => HTMLElement> = {
  quality: qualityTab,
  review: (ctx) => {
    const box = h(ctx.doc, "div");
    if (ctx.st.doc) box.append(...reviewLines(ctx.st.doc, ctx.st.versions).map((line) => h(ctx.doc, "p", SIDE_TEXT, line)));
    return box;
  },
  comments: commentsTab,
};
const TAB_NAMES: [keyof typeof SIDE_TABS, string][] = [["quality", "Quality"], ["review", "Review"], ["comments", "Comments"]];

export const OUTLINE: { pane: (ctx: PaneCtx) => HTMLElement } = { pane: outlinePane };

const VIEW_NAMES: [View, string][] = [["edit", "Edit"], ["read", "Read"], ["compare", "Compare"], ["versions", "Versions"]];

export function workspacePage(opts: { baseUrl: string; onBack: () => void; onLeave?: () => void; doc?: Document }): WorkspaceEl {
  const d = opts.doc ?? document;
  const base = opts.baseUrl.replace(/\/$/, "");
  const ws = createWorkspace({
    json: async (method, path, body) => {
      const r = await bfetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    activePid,
    scope: () => loadScope(activePid()),
    onProjectChange: (cb) => onActiveProjectChange(() => cb()),
    askYesNo: (q) => askYesNo(q, { doc: d }),
    role: async (key) => (await myRoleRead(base, key)).role,
    me: async () => (await currentUser())?.email || "web",
  }, () => renderAll());

  const root = h(d, "div", `display:flex;flex-direction:column;height:100%;min-height:0;background:${C.bg};color:${C.text};font:13px system-ui`) as unknown as WorkspaceEl;
  // Header: the centre 20rem stays free for the floating project pill, the right padding for the account avatar.
  const header = h(d, "div", `display:grid;grid-template-columns:minmax(0,1fr) 20rem minmax(0,1fr);align-items:center;gap:.6rem;padding:.55rem .9rem;padding-right:5.5rem;border-bottom:1px solid ${C.border};background:${C.panel};flex:0 0 auto`);
  const left = h(d, "div", "display:flex;align-items:center;gap:.6rem;min-width:0");
  const back = btn(d, "← Back to the project");
  back.addEventListener("click", () => opts.onBack());
  const keyEl = h(d, "span", `color:${C.muted};font:11px ui-monospace,monospace;flex:0 0 auto`);
  const titleEl = h(d, "span", "font:600 14px system-ui;color:#fff;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap");
  const statusEl = h(d, "span", `color:${C.soft};font:11px system-ui;flex:0 0 auto`);
  left.append(back, keyEl, titleEl, statusEl);
  const viewBar = h(d, "div", "display:flex;gap:.3rem;justify-content:flex-end");
  header.append(left, h(d, "div"), viewBar);
  const msgEl = h(d, "div", `padding:.4rem .9rem;color:${C.warn};font:12px system-ui;border-bottom:1px solid ${C.line};flex:0 0 auto`);
  const GRID = "15rem minmax(0,1fr) 20rem";
  const grid = h(d, "div", `flex:1;min-height:0;display:grid;grid-template-columns:${GRID}`);
  const outlineCol = h(d, "div", `border-right:1px solid ${C.line};overflow:auto;padding:.6rem .5rem;background:${C.side}`);
  const centre = h(d, "div", "overflow:auto;padding:1.2rem 1.6rem");
  const sideCol = h(d, "div", `border-left:1px solid ${C.line};overflow:auto;padding:.6rem .7rem;background:${C.side}`);
  grid.append(outlineCol, centre, sideCol);
  root.append(header, msgEl, grid);

  let view: View = "read";
  let tab: keyof typeof SIDE_TABS = "quality";
  let focused: string | null = null;
  // The ingest review, full width (outline and side hidden). The element is kept so a re-render never loses the edits;
  // a render for another project drops it, and so does opening a document.
  let ingest: { key: string; el: HTMLElement } | null = null;
  let opening = 0; // explicit opens in flight: the reopen on show never overrides one
  // F1: the Edit view on screen, and the unsaved editors carried from it to the next Edit view of the same document
  // (any redraw, or Read and back). Dropped for another document or a project or person change (the scope), never because
  // a read failed; a saved block leaves it.
  let pane: { docId: string; scope: string; el: EditPaneEl } | null = null;
  let carry: { docId: string; scope: string; drafts: Map<string, Carried> } | null = null;
  const last = new Map<string, string>(); // project key → the document last opened there

  const ctx = (): PaneCtx => {
    const st = ws.state();
    return { ws, st, doc: d, base, ...rightsOf(st), focused, focus, show, refresh, openDoc: (id) => root.open(id), editorOf: (id) => pane?.el.editor(id) };
  };

  function renderHeader(c: PaneCtx): void {
    keyEl.textContent = c.st.key;
    titleEl.textContent = ingest ? "Review ingestion" : c.st.doc?.title ?? ""; // the review is not the open document: no title, status or views of it
    statusEl.textContent = !ingest && c.st.doc ? statusLine(c.st.doc) : "";
    viewBar.replaceChildren();
    if (ingest || !c.st.doc) return;
    if (view === "edit" && c.canEdit) viewBar.append(aiPicker(c.base, () => c.st.key)); // the one AI picker; Draft with AI reads its selection
    for (const [v, label] of VIEW_NAMES) {
      if (v === "edit" && !c.canEdit) continue;
      const b = btn(d, label, v === view);
      b.addEventListener("click", () => show(v));
      viewBar.append(b);
    }
  }
  function renderMessage(c: PaneCtx): void {
    const lines = c.st.doc && !ingest ? [c.st.message, ...c.st.problems].filter(Boolean) : []; // with no document the centre says it
    msgEl.replaceChildren(...lines.map((t) => h(d, "div", "", t)));
    msgEl.style.display = lines.length ? "" : "none";
  }
  function renderOutline(c: PaneCtx): void {
    outlineCol.replaceChildren(...(c.st.doc ? [OUTLINE.pane(c)] : []));
  }
  function renderCentre(c: PaneCtx): void {
    const scope = loadScope(activePid());
    if (pane) carry = { docId: pane.docId, scope: pane.scope, drafts: pane.el.drafts() };
    pane = null;
    if (carry && (carry.scope !== scope || (c.st.doc && carry.docId !== c.st.doc.id))) carry = null;
    if (ingest) { centre.replaceChildren(ingest.el); return; }
    if (!c.st.doc) { centre.replaceChildren(h(d, "div", `color:${C.muted}`, c.st.message || "Open a document from the project's Documents tab.")); return; }
    const strip = view === "edit" ? startStrip(c) : null; // above the editing pane, never on the read views
    const kind = c.st.doc.doc_type;
    const note = view === "read" && kind === "TIDP" ? h(d, "div", `color:${C.muted};font:12px system-ui;margin:0 0 .8rem`, READ_ONLY_NOTE.TIDP) : null; // read-only types: old plans are read here
    const main = view === "read" && kind === "READINESS" ? readinessView(c) : VIEWS[view]({ ...c, drafts: carry?.drafts });
    if (view === "edit") pane = { docId: c.st.doc.id, scope, el: main as EditPaneEl };
    centre.replaceChildren(...(strip ? [strip] : []), ...(note ? [note] : []), main);
  }
  function renderSide(c: PaneCtx): void {
    if (!c.st.doc) { sideCol.replaceChildren(); return; }
    const tabs = h(d, "div", "display:flex;gap:.3rem;margin-bottom:.7rem");
    for (const [t, label] of TAB_NAMES) {
      const b = btn(d, label, t === tab);
      b.addEventListener("click", () => { tab = t; renderSide(ctx()); });
      tabs.append(b);
    }
    sideCol.replaceChildren(tabs, SIDE_TABS[tab](c));
  }
  function renderAll(): void {
    const c = ctx();
    if (ingest && ingest.key !== c.st.key) ingest = null;
    grid.style.gridTemplateColumns = ingest ? "minmax(0,1fr)" : GRID;
    outlineCol.style.display = sideCol.style.display = ingest ? "none" : "";
    if (view === "edit" && !c.canEdit) view = "read";
    renderHeader(c); renderMessage(c); renderOutline(c); renderCentre(c); renderSide(c);
  }

  function show(v: View): void {
    view = v;
    renderAll();
  }
  function refresh(part: "outline" | "side" | "all"): void {
    if (part === "all") return renderAll();
    const c = ctx();
    renderMessage(c); // a write that landed may have changed the top message
    (part === "outline" ? renderOutline : renderSide)(c);
  }
  function focus(sectionId: string): void {
    focused = sectionId;
    const c = ctx();
    renderOutline(c); renderSide(c);
    const node = Array.from(centre.querySelectorAll<HTMLElement>("[data-section]")).find((n) => n.dataset.section === sectionId);
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  root.open = async (docId, at = {}) => {
    opening++;
    try {
      await ws.open(docId);
      const st = ws.state();
      if (!st.doc || st.doc.id !== docId) return; // stale, or not read (the centre says why)
      last.set(st.key, docId);
      ingest = null;
      view = at.view ?? (rightsOf(st).canEdit ? "edit" : "read");
      focused = null;
      renderAll();
      const sid = resolveSection(st.doc, at.section);
      if (sid) focus(sid);
    } finally {
      opening--;
    }
  };

  root.openIngest = (p) => {
    const key = ws.state().key;
    ingest = { key, el: ingestView(ctx(), p, () => { ingest = null; renderAll(); }) };
    renderAll();
  };

  // Shown again: a document held is read again once (a publish in the Documents tab may have changed it; open editors are
  // carried), else the activity-bar icon shows the page with no document and this project's last one is reopened.
  let shown = false;
  if (typeof ResizeObserver !== "undefined")
    new ResizeObserver(() => {
      const now = root.clientWidth > 0 && root.clientHeight > 0; // 0 = hidden behind another layout
      const edge = becameVisible(shown, now);
      if (shown && !now) opts.onLeave?.(); // left for another layout (Back, the activity bar): the old Documents panel re-reads
      shown = now;
      if (!edge || opening > 0) return; // a resize while shown never reads; an explicit open in flight wins
      if (ws.state().doc) { void ws.reload(); return; }
      const key = activePid(), id = reopenTarget(last, key, null, ingest !== null); // an ingest review on screen is never replaced
      if (id) void root.open(id).then(() => { const st = ws.state(); if (st.key === key && !st.doc) last.delete(key); }); // unreadable: forget it
    }).observe(root);

  renderAll();
  return root;
}
