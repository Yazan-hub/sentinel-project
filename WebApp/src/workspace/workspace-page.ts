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
import { editPane } from "./block-editors";
import { commentsTab, outlinePane } from "./outline";
import { readView } from "./read-view";
import { compareView, versionsView } from "./versions-view";

export type View = "edit" | "read" | "compare" | "versions";
export interface PaneCtx { ws: Workspace; st: WorkspaceState; doc: Document; base: string; canEdit: boolean; canGovern: boolean;
  focused: string | null; focus(sectionId: string): void; show(view: View): void; refresh(part: "outline" | "side" | "all"): void;
  openDoc(docId: string): Promise<void> /* the page's own open: view reset, remembered as this project's last document */;
  /** Set by the edit view for the editors it opens: show this fresh row's version of one section without closing its open editors. */
  sectionApplied?(sectionId: string, fresh: DocRow): Promise<void> }
export type WorkspaceEl = HTMLElement & { open(docId: string, at?: { section?: string; view?: View }): Promise<void> };

// Every view marks each section node with dataset.section = its id (PaneCtx.focus scrolls to it).
export const VIEWS: Record<View, (ctx: PaneCtx) => HTMLElement> = { edit: editPane, read: readView, compare: compareView, versions: versionsView };

const SIDE_TEXT = `color:${C.soft};font:12px system-ui;line-height:1.5;margin:0 0 .5rem`;
export const SIDE_TABS: Record<"quality" | "review" | "comments", (ctx: PaneCtx) => HTMLElement> = {
  quality: (ctx) => h(ctx.doc, "p", SIDE_TEXT, ctx.st.ex?.headline ?? "Not scored yet."),
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

export function workspacePage(opts: { baseUrl: string; onBack: () => void; doc?: Document }): WorkspaceEl {
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
  const grid = h(d, "div", "flex:1;min-height:0;display:grid;grid-template-columns:15rem minmax(0,1fr) 20rem");
  const outlineCol = h(d, "div", `border-right:1px solid ${C.line};overflow:auto;padding:.6rem .5rem;background:${C.side}`);
  const centre = h(d, "div", "overflow:auto;padding:1.2rem 1.6rem");
  const sideCol = h(d, "div", `border-left:1px solid ${C.line};overflow:auto;padding:.6rem .7rem;background:${C.side}`);
  grid.append(outlineCol, centre, sideCol);
  root.append(header, msgEl, grid);

  let view: View = "read";
  let tab: keyof typeof SIDE_TABS = "quality";
  let focused: string | null = null;
  let opening = 0; // explicit opens in flight: the reopen on show never overrides one
  const last = new Map<string, string>(); // project key → the document last opened there

  const ctx = (): PaneCtx => {
    const st = ws.state();
    return { ws, st, doc: d, base, ...rightsOf(st), focused, focus, show, refresh, openDoc: (id) => root.open(id) };
  };

  function renderHeader(c: PaneCtx): void {
    keyEl.textContent = c.st.key;
    titleEl.textContent = c.st.doc?.title ?? "";
    statusEl.textContent = c.st.doc ? statusLine(c.st.doc) : "";
    viewBar.replaceChildren();
    if (!c.st.doc) return;
    if (view === "edit" && c.canEdit) viewBar.append(aiPicker(c.base, () => c.st.key)); // the one AI picker; Draft with AI reads its selection
    for (const [v, label] of VIEW_NAMES) {
      if (v === "edit" && !c.canEdit) continue;
      const b = btn(d, label, v === view);
      b.addEventListener("click", () => show(v));
      viewBar.append(b);
    }
  }
  function renderMessage(c: PaneCtx): void {
    const lines = c.st.doc ? [c.st.message, ...c.st.problems].filter(Boolean) : []; // with no document the centre says it
    msgEl.replaceChildren(...lines.map((t) => h(d, "div", "", t)));
    msgEl.style.display = lines.length ? "" : "none";
  }
  function renderOutline(c: PaneCtx): void {
    outlineCol.replaceChildren(...(c.st.doc ? [OUTLINE.pane(c)] : []));
  }
  function renderCentre(c: PaneCtx): void {
    centre.replaceChildren(c.st.doc ? VIEWS[view](c) : h(d, "div", `color:${C.muted}`, c.st.message || "Open a document from the project's Documents tab."));
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
    if (view === "edit" && !c.canEdit) view = "read";
    renderHeader(c); renderMessage(c); renderOutline(c); renderCentre(c); renderSide(c);
  }

  function show(v: View): void {
    view = v;
    renderAll();
  }
  function refresh(part: "outline" | "side" | "all"): void {
    if (part === "all") return renderAll();
    (part === "outline" ? renderOutline : renderSide)(ctx());
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
      view = at.view ?? (rightsOf(st).canEdit ? "edit" : "read");
      focused = null;
      renderAll();
      const sid = resolveSection(st.doc, at.section);
      if (sid) focus(sid);
    } finally {
      opening--;
    }
  };

  // The activity-bar icon shows the page with no document: reopen this project's last one.
  let shown = false;
  if (typeof ResizeObserver !== "undefined")
    new ResizeObserver(() => {
      const now = root.clientWidth > 0 && root.clientHeight > 0; // 0 = hidden behind another layout
      const edge = becameVisible(shown, now);
      shown = now;
      if (!edge) return; // a resize while shown never reopens
      const key = activePid(), id = reopenTarget(last, key, ws.state().doc, opening > 0);
      if (id) void root.open(id).then(() => { const st = ws.state(); if (st.key === key && !st.doc) last.delete(key); }); // unreadable: forget it
    }).observe(root);

  renderAll();
  return root;
}
