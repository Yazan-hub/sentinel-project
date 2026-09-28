import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { buildModelTree, type TreeCategory, type TreeInstance, type TreeModelNode } from "../sentinel-core/adapter/project-tree";
import { detectDrawings } from "../sentinel-core/adapter/drawings-detect";

/**
 * Sentinel Project Browser (Phase 4 — Revit-influenced). A Category → Type → Instance tree of every
 * loaded model — under one branch per model once two or more are loaded, so a federation shows which model an element
 * belongs to and the same type name in two models stays two rows (3D spec Decision 7) — driving selection: click a category/type to select the whole group, or an instance to
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
    `<button id="pb-2d" style="${btn}" title="Scan for 2D drawings / sheets / annotations in the model">⌕ 2D</button>` +
    `<button id="pb-refresh" style="${btn}" title="Rebuild from loaded models">↻</button>` +
    "</div>" +
    `<div style="padding:.45rem .6rem;border-bottom:1px solid #2a2a30"><input id="pb-filter" placeholder="Filter…" style="width:100%;background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.3rem .5rem;font:12px system-ui"/></div>` +
    '<div id="pb-tree" style="flex:1;overflow:auto;padding:.35rem"></div>' +
    '<div id="pb-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">…</div>';
  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const status = (t: string) => (el("pb-status").textContent = t);

  let models: TreeModelNode[] = [];
  let filter = "";

  const rowStyle = (indent: number, bold = false) =>
    `display:flex;align-items:center;gap:.3rem;padding:.25rem .3rem;padding-left:${0.3 + indent * 0.9}rem;cursor:pointer;border-radius:.25rem;font-size:12px;${bold ? "font-weight:600;" : ""}`;
  const caret = (open: boolean) => `<span style="width:.8rem;color:#6b7280">${open ? "▾" : "▸"}</span>`;
  const badge = (n: number) => `<span style="margin-left:auto;color:#6b7280;font-size:11px">${n}</span>`;

  const matches = (s: string) => !filter || s.toLowerCase().includes(filter);

  // One category list (a model's, or the only model's), rendered under `host` at `base` indent. Returns the element
  // count of the groups it showed (for the filter status).
  function renderCats(host: HTMLElement, cats: TreeCategory[], base: number): number {
    let shown = 0;
    for (const cat of cats) {
      // filter: keep category if its label, any type name, or any instance name matches
      const typeHits = cat.types.filter((t) => matches(t.name) || matches(cat.label) || t.instances.some((i) => matches(i.name)));
      if (filter && !matches(cat.label) && typeHits.length === 0) continue;
      shown += cat.count;

      const catEl = document.createElement("div");
      const head = document.createElement("div");
      head.style.cssText = rowStyle(base, true);
      head.innerHTML = caret(false) + `<span style="color:#c4b5fd">${esc(cat.label)}</span><span style="color:#6b7280;font-size:11px">&nbsp;${esc(cat.category)}</span>` + badge(cat.count);
      const kids = document.createElement("div");
      kids.style.display = filter ? "block" : "none";
      let built = false;
      const buildTypes = () => {
        if (built) return; built = true;
        for (const t of (filter ? typeHits : cat.types)) {
          const trow = document.createElement("div");
          const th = document.createElement("div");
          th.style.cssText = rowStyle(base + 1, true);
          th.innerHTML = caret(false) + `<span>${esc(t.name)}</span>` + badge(t.instances.length);
          const insts = document.createElement("div");
          insts.style.display = "none";
          let ibuilt = false;
          const buildInsts = () => {
            if (ibuilt) return; ibuilt = true;
            for (const inst of t.instances) {
              if (filter && !matches(inst.name) && !matches(t.name) && !matches(cat.label)) continue;
              const irow = document.createElement("div");
              irow.style.cssText = rowStyle(base + 2);
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
    return shown;
  }

  function renderTree() {
    const host = el("pb-tree");
    host.innerHTML = "";
    let shown = 0;
    if (models.length <= 1) shown = renderCats(host, models[0]?.categories ?? [], 0);
    else {
      // A federation: one branch per model, open by default; double-click selects the whole model.
      for (const m of models) {
        const holder = document.createElement("div");
        const head = document.createElement("div");
        head.style.cssText = rowStyle(0, true) + "border-top:1px solid #23232b;margin-top:.15rem;";
        head.innerHTML = caret(true) + `<span style="color:#93c5fd">▣ ${esc(m.modelId)}</span>` + badge(m.count);
        head.title = "Model — click to fold, double-click to select all its elements";
        const kids = document.createElement("div");
        const n = renderCats(kids, m.categories, 1);
        if (filter && n === 0) continue;
        shown += n;
        if (!m.count) kids.innerHTML = '<div style="color:#6b7280;font-size:11px;padding:.2rem 0 .2rem 1.5rem">no building elements read from this model</div>';
        head.addEventListener("click", () => {
          const open = kids.style.display === "none";
          kids.style.display = open ? "block" : "none";
          (head.firstChild as HTMLElement).innerHTML = open ? "▾" : "▸";
        });
        head.addEventListener("dblclick", () => select(m.categories.flatMap((c) => c.types.flatMap((t) => t.instances))));
        head.addEventListener("mouseenter", () => (head.style.background = "#1c1c24"));
        head.addEventListener("mouseleave", () => (head.style.background = "transparent"));
        holder.appendChild(head); holder.appendChild(kids);
        host.appendChild(holder);
      }
    }
    if (!models.length) host.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:.6rem;line-height:1.5">No model loaded. Open one from <b>Projects ▸ Project Files ▸ Open 3D</b>; the tree builds itself.</div>';
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
    if (fragments.list.size === 0) { models = []; renderTree(); status("No model loaded."); return; }
    status("Building tree…");
    try {
      models = await buildModelTree(fragments);
      renderTree();
      const total = models.reduce((a, m) => a + m.count, 0);
      const cats = new Set(models.flatMap((m) => m.categories.map((c) => c.category))).size;
      status(`${models.length > 1 ? `${models.length} models · ` : ""}${cats} categories · ${total.toLocaleString("en-US")} elements. Click to select · dbl-click a category${models.length > 1 ? " or a model" : ""} to select all.`);
    } catch (e) { status("Tree build failed: " + ((e as Error)?.message ?? String(e))); }
  }

  el("pb-refresh").addEventListener("click", refresh);
  el("pb-filter").addEventListener("input", (e) => { filter = (e.target as HTMLInputElement).value.trim().toLowerCase(); renderTree(); });
  // Rebuild when models load or unload (an unloaded model's rows would otherwise stay and select nothing).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (fragments as any).core?.onModelLoaded?.add?.(() => void refresh());
  fragments.list.onItemDeleted.add(() => void refresh());
  void refresh();

  // Scan for 2D drawings / sheets / annotations. Reports what's present (console + status) and isolates any
  // 2D/annotation content so it can be viewed. Most Revit→IFC exports carry none — this makes that explicit.
  async function scan2d() {
    if (fragments.list.size === 0) { status("Load a model first."); return; }
    status("Scanning for 2D drawings / sheets…");
    try {
      const scan = await detectDrawings(fragments);
      // eslint-disable-next-line no-console
      console.log("[Sentinel] 2D/drawing scan", scan);
      if (!scan.byCategory.length) {
        status("No drawings, sheets or annotations in this model — it's a 3D-only IFC. Use the Plans tab for 2D floor plans.");
        return;
      }
      const summary = scan.byCategory.map((r) => `${r.label} ${r.count}`).join(" · ");
      if (scan.has2d) {
        const map: OBC.ModelIdMap = {};
        for (const [mid, set] of Object.entries(scan.drawingMap)) map[mid] = new Set(set);
        try { await hider.set(true); await hider.isolate(map); await fragments.core.update(true); await highlighter.highlightByID("select", map, true, true); } catch { /* */ }
        status(`Found & isolated 2D content — ${summary}. (Show all in Visibility to restore.)`);
      } else {
        status(`Found ${summary} — but no viewable 2D drawing geometry (grids/layers/refs only). Use Plans for floor plans.`);
      }
    } catch (e) { status("2D scan failed: " + ((e as Error)?.message ?? String(e))); }
  }
  (root.querySelector("#pb-2d") as HTMLButtonElement).addEventListener("click", scan2d);
  return root;
}
