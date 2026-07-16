import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { buildProjectTree, type TreeCategory, type TreeInstance } from "../sentinel-core/adapter/project-tree";

/**
 * Sentinel Project Browser (Phase 4 — Revit-influenced). A Category → Type → Instance tree of every
 * loaded model, driving selection: click a category/type to select the whole group, or an instance to
 * select + zoom to it. Selection flows through OBF.Highlighter, so the Properties Palette updates too.
 * Lazy-rendered (types/instances build on expand) to stay light on large models. Plain-DOM, iframe-safe.
 */
export function projectBrowserPanel(components: OBC.Components): HTMLElement {
  const fragments = components.get(OBC.FragmentsManager);
  const highlighter = components.get(OBF.Highlighter);
  const hider = components.get(OBC.Hider);

  const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  const btn = "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.3rem .5rem;font:600 11px system-ui;cursor:pointer";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
    '<span style="font-weight:600">☰ Browser</span><span style="color:#9ca3af;font-size:11px">categories</span>' +
    '<span style="flex:1"></span>' +
    `<button id="pb-refresh" style="${btn}" title="Rebuild from loaded models">↻</button>` +
    "</div>" +
    `<div style="padding:.45rem .6rem;border-bottom:1px solid #2a2a30"><input id="pb-filter" placeholder="Filter…" style="width:100%;background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.3rem .5rem;font:12px system-ui"/></div>` +
    '<div id="pb-tree" style="flex:1;overflow:auto;padding:.35rem"></div>' +
    '<div id="pb-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">…</div>';
  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const status = (t: string) => (el("pb-status").textContent = t);

  let tree: TreeCategory[] = [];
  let filter = "";

  const rowStyle = (indent: number, bold = false) =>
    `display:flex;align-items:center;gap:.3rem;padding:.25rem .3rem;padding-left:${0.3 + indent * 0.9}rem;cursor:pointer;border-radius:.25rem;font-size:12px;${bold ? "font-weight:600;" : ""}`;
  const caret = (open: boolean) => `<span style="width:.8rem;color:#6b7280">${open ? "▾" : "▸"}</span>`;
  const badge = (n: number) => `<span style="margin-left:auto;color:#6b7280;font-size:11px">${n}</span>`;

  const matches = (s: string) => !filter || s.toLowerCase().includes(filter);

  function renderTree() {
    const host = el("pb-tree");
    host.innerHTML = "";
    let shown = 0;
    for (const cat of tree) {
      // filter: keep category if its label, any type name, or any instance name matches
      const typeHits = cat.types.filter((t) => matches(t.name) || matches(cat.label) || t.instances.some((i) => matches(i.name)));
      if (filter && !matches(cat.label) && typeHits.length === 0) continue;
      shown += cat.count;

      const catEl = document.createElement("div");
      const head = document.createElement("div");
      head.style.cssText = rowStyle(0, true);
      head.innerHTML = caret(false) + `<span style="color:#c4b5fd">${esc(cat.label)}</span><span style="color:#6b7280;font-size:11px">&nbsp;${esc(cat.category)}</span>` + badge(cat.count);
      const kids = document.createElement("div");
      kids.style.display = filter ? "block" : "none";
      let built = false;
      const buildTypes = () => {
        if (built) return; built = true;
        for (const t of (filter ? typeHits : cat.types)) {
          const trow = document.createElement("div");
          const th = document.createElement("div");
          th.style.cssText = rowStyle(1, true);
          th.innerHTML = caret(false) + `<span>${esc(t.name)}</span>` + badge(t.instances.length);
          const insts = document.createElement("div");
          insts.style.display = "none";
          let ibuilt = false;
          const buildInsts = () => {
            if (ibuilt) return; ibuilt = true;
            for (const inst of t.instances) {
              if (filter && !matches(inst.name) && !matches(t.name) && !matches(cat.label)) continue;
              const irow = document.createElement("div");
              irow.style.cssText = rowStyle(2);
              irow.innerHTML = `<span style="width:.8rem;color:#3f3f46">•</span><span style="color:#d4d4d8">${esc(inst.name)}</span>`;
              irow.addEventListener("mouseenter", () => (irow.style.background = "#20202a"));
              irow.addEventListener("mouseleave", () => (irow.style.background = "transparent"));
              irow.addEventListener("click", (e) => { e.stopPropagation(); select([inst]); });
              insts.appendChild(irow);
            }
          };
          th.addEventListener("click", (e) => {
            e.stopPropagation();
            const open = insts.style.display === "none";
            buildInsts();
            insts.style.display = open ? "block" : "none";
            (th.firstChild as HTMLElement).innerHTML = open ? "▾" : "▸";
            if (open) select(t.instances); // selecting a type selects all its instances
          });
          th.addEventListener("mouseenter", () => (th.style.background = "#1c1c24"));
          th.addEventListener("mouseleave", () => (th.style.background = "transparent"));
          trow.appendChild(th); trow.appendChild(insts);
          kids.appendChild(trow);
        }
      };
      if (filter) buildTypes();
      head.addEventListener("click", () => {
        const open = kids.style.display === "none";
        buildTypes();
        kids.style.display = open ? "block" : "none";
        (head.firstChild as HTMLElement).innerHTML = open ? "▾" : "▸";
      });
      head.addEventListener("dblclick", () => select(cat.types.flatMap((t) => t.instances))); // dbl-click = select whole category
      head.addEventListener("mouseenter", () => (head.style.background = "#1c1c24"));
      head.addEventListener("mouseleave", () => (head.style.background = "transparent"));
      catEl.appendChild(head); catEl.appendChild(kids);
      host.appendChild(catEl);
    }
    if (!tree.length) host.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:.6rem;line-height:1.5">No model loaded. Load an IFC via <b>Assets</b>, then press ↻.</div>';
    else if (filter) status(`Filter “${filter}” · ${shown} element(s) in matching groups.`);
  }

  async function select(instances: TreeInstance[]) {
    if (!instances.length) return;
    const map: OBC.ModelIdMap = {};
    for (const i of instances) (map[i.modelId] ??= new Set<number>()).add(i.localId);
    try {
      // highlightByID drives the "select" style → the Properties Palette (which listens to that event)
      // updates too, and the last arg zooms the camera to the selection.
      await highlighter.highlightByID("select", map, true, true);
      status(`Selected ${instances.length} element(s).`);
    } catch (e) { status("Select failed: " + ((e as Error)?.message ?? String(e))); }
  }

  async function refresh() {
    if (fragments.list.size === 0) { tree = []; renderTree(); status("No model loaded."); return; }
    status("Building tree…");
    try {
      tree = await buildProjectTree(fragments);
      renderTree();
      const total = tree.reduce((a, c) => a + c.count, 0);
      status(`${tree.length} categories · ${total.toLocaleString("en-US")} elements. Click to select · dbl-click a category to select all.`);
    } catch (e) { status("Tree build failed: " + ((e as Error)?.message ?? String(e))); }
  }

  el("pb-refresh").addEventListener("click", refresh);
  el("pb-filter").addEventListener("input", (e) => { filter = (e.target as HTMLInputElement).value.trim().toLowerCase(); renderTree(); });
  // Rebuild when models load/unload.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (fragments as any).core?.onModelLoaded?.add?.(() => void refresh());
  void refresh();

  // expose hider for a future "isolate category" (P3); referenced to avoid unused in strict builds
  void hider;
  return root;
}
