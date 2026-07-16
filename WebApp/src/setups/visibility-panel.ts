import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { buildProjectTree, type TreeCategory } from "../sentinel-core/adapter/project-tree";

/**
 * Sentinel Visibility / Graphics (Phase 3 — Revit "VG" overrides). Per-category show/hide, isolate,
 * ghost (x-ray) and colour override across all loaded models. Visibility uses the proven OBC.Hider API
 * (set / isolate) + fragments.core.update to refresh; ghost uses model.setGhostItems; colour uses an
 * OBF.Highlighter style per category (best-effort — guarded, since it depends on the OBF style shape).
 * Plain-DOM, iframe-safe. Docked as the "Visibility" tab.
 */
export function visibilityPanel(components: OBC.Components): HTMLElement {
  const fragments = components.get(OBC.FragmentsManager);
  const hider = components.get(OBC.Hider);
  const highlighter = components.get(OBF.Highlighter);

  const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const refreshView = async () => { try { await fragments.core.update(true); } catch { /* */ } };

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  const btn = "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.3rem .5rem;font:600 11px system-ui;cursor:pointer";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
    '<span style="font-weight:600">◱ Visibility</span><span style="color:#9ca3af;font-size:11px">graphics overrides</span>' +
    '<span style="flex:1"></span>' +
    `<button id="vg-showall" style="${btn}" title="Show everything, clear ghosts/colours">Show all</button>` +
    `<button id="vg-refresh" style="${btn}" title="Rebuild category list">↻</button>` +
    "</div>" +
    '<div id="vg-list" style="flex:1;overflow:auto;padding:.35rem"></div>' +
    '<div id="vg-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">…</div>';
  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const status = (t: string) => (el("vg-status").textContent = t);

  let tree: TreeCategory[] = [];
  const hidden = new Set<string>(); // category keys currently hidden

  const mapOf = (cat: TreeCategory): OBC.ModelIdMap => {
    const m: OBC.ModelIdMap = {};
    for (const t of cat.types) for (const i of t.instances) (m[i.modelId] ??= new Set<number>()).add(i.localId);
    return m;
  };

  const iconBtn = (glyph: string, title: string) => {
    const b = document.createElement("button");
    b.textContent = glyph; b.title = title;
    b.style.cssText = "border:1px solid #2c2c34;background:#1b1b21;color:#d4d4d8;border-radius:.3rem;padding:.15rem .4rem;font:12px system-ui;cursor:pointer";
    return b;
  };

  function renderList() {
    const host = el("vg-list");
    host.innerHTML = "";
    if (!tree.length) { host.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:.6rem;line-height:1.5">No model loaded. Load an IFC via <b>Assets</b>, then ↻.</div>'; return; }
    for (const cat of tree) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:.35rem;padding:.3rem .3rem;border-bottom:1px solid #202028";
      const isHidden = hidden.has(cat.category);
      const nameEl = document.createElement("span");
      nameEl.style.cssText = `flex:1;font-size:12px;color:${isHidden ? "#6b7280" : "#e5e7eb"}`;
      nameEl.innerHTML = `${esc(cat.label)} <span style="color:#6b7280">${cat.count}</span>`;

      const eye = iconBtn(isHidden ? "🚫" : "👁", isHidden ? "Show" : "Hide");
      eye.addEventListener("click", async () => {
        const map = mapOf(cat);
        if (hidden.has(cat.category)) { hidden.delete(cat.category); await hider.set(true, map); }
        else { hidden.add(cat.category); await hider.set(false, map); }
        await refreshView(); renderList();
      });
      const iso = iconBtn("◎", "Isolate this category");
      iso.addEventListener("click", async () => { await hider.isolate(mapOf(cat)); await refreshView(); status(`Isolated ${cat.label}.`); });
      const ghost = iconBtn("◍", "Ghost (x-ray) this category");
      ghost.addEventListener("click", async () => { await setGhost(cat); status(`Ghosted ${cat.label}.`); });

      const color = document.createElement("input");
      color.type = "color"; color.title = "Colour override";
      color.style.cssText = "width:1.6rem;height:1.4rem;border:1px solid #2c2c34;border-radius:.3rem;background:#1b1b21;cursor:pointer;padding:0";
      color.addEventListener("input", () => colorCategory(cat, color.value));

      row.append(nameEl, color, eye, iso, ghost);
      host.appendChild(row);
    }
  }

  async function setGhost(cat: TreeCategory) {
    const tasks: Promise<unknown>[] = [];
    for (const [modelId, set] of Object.entries(mapOf(cat))) {
      const model = fragments.list.get(modelId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (model && set.size) tasks.push((model as any).setGhostItems?.([...set], false));
    }
    try { await Promise.all(tasks); await refreshView(); } catch (e) { status("Ghost failed: " + ((e as Error)?.message ?? String(e))); }
  }

  function colorCategory(cat: TreeCategory, hex: string) {
    const name = "vg_" + cat.category;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hl = highlighter as any;
      hl.styles?.set?.(name, { color: new THREE.Color(hex) });
      hl.highlightByID?.(name, mapOf(cat), false, false);
      status(`Coloured ${cat.label}.`);
    } catch (e) { status("Colour override not supported in this build: " + ((e as Error)?.message ?? String(e))); }
  }

  async function showAll() {
    hidden.clear();
    try {
      await hider.set(true);
      for (const model of fragments.list.values()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (model as any).clearGhost?.();
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (highlighter as any).clear?.();
      await refreshView();
    } catch { /* */ }
    renderList();
    status("All visible · ghosts + colours cleared.");
  }

  async function refresh() {
    if (fragments.list.size === 0) { tree = []; renderList(); status("No model loaded."); return; }
    status("Reading categories…");
    try {
      tree = await buildProjectTree(fragments);
      hidden.clear();
      renderList();
      status(`${tree.length} categor${tree.length === 1 ? "y" : "ies"} · toggle 👁 hide · ◎ isolate · ◍ ghost · colour swatch to override.`);
    } catch (e) { status("Failed: " + ((e as Error)?.message ?? String(e))); }
  }

  el("vg-refresh").addEventListener("click", refresh);
  el("vg-showall").addEventListener("click", showAll);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (fragments as any).core?.onModelLoaded?.add?.(() => void refresh());
  void refresh();
  return root;
}
