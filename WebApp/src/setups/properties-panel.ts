import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { extractElementProperties, type ElementProperties } from "../sentinel-core/adapter/element-properties";

/**
 * Sentinel Properties Palette (Phase 1 — Revit-influenced element data). Click an element in a loaded
 * model → it highlights (OBF.Highlighter's "select" style) → this panel extracts its IFC identity +
 * property/quantity sets (clean, IDS-ready shape) and shows them in collapsible Revit-style groups.
 *
 * Selection source: the Highlighter's select event (driven by the viewer's Select mode). Properties come
 * from loaded fragment models (real IFC). Authored sketch elements have no IFC psets until Baked to IFC.
 * Also logs the parsed properties to the console (the Phase-1 checkpoint).
 *
 * Plain-DOM panel (mirrors issue-panel); iframe-safe (no prompt/confirm). Docked as the "Props" tab.
 */
export function propertiesPanel(components: OBC.Components): HTMLElement {
  const fragments = components.get(OBC.FragmentsManager);
  const highlighter = components.get(OBF.Highlighter);
  const hider = components.get(OBC.Hider);

  const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  const btn = "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.3rem .5rem;font:600 11px system-ui;cursor:pointer";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
    '<span style="font-weight:600">▦ Properties</span><span style="color:#9ca3af;font-size:11px">select an element</span>' +
    '<span style="flex:1"></span>' +
    `<button id="pp-iso" style="${btn}" title="Isolate the selected element">Isolate</button>` +
    `<button id="pp-show" style="${btn}" title="Show everything">Show all</button>` +
    "</div>" +
    '<div id="pp-body" style="flex:1;overflow:auto;padding:.6rem"></div>' +
    '<div id="pp-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">No selection.</div>';
  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const status = (t: string) => (el("pp-status").textContent = t);
  const body = el("pp-body");

  let current: { modelId: string; localId: number } | null = null;

  const empty = () => {
    body.innerHTML =
      '<div style="color:#9ca3af;font-size:12px;line-height:1.6;padding:.5rem">' +
      "Click an element in a <b>loaded model</b> (Assets ▸ load an IFC, or Bake your sketch and re-import) — " +
      "its identity and IFC property sets appear here, Revit-Properties-Palette style." +
      "</div>";
    status("No selection.");
  };

  const groupHtml = (title: string, rows: { name: string; value: string }[], accent = "#c9cfda", open = true) => {
    const id = "g" + Math.abs(hashCode(title));
    return (
      `<div style="border:1px solid #26262e;border-radius:.4rem;margin-bottom:.5rem;overflow:hidden">` +
      `<div class="pp-h" data-t="${id}" style="display:flex;justify-content:space-between;cursor:pointer;background:#1b1b21;padding:.4rem .55rem;font-weight:600;color:${accent}">` +
      `<span>${esc(title)}</span><span style="color:#6b7280">${rows.length}</span></div>` +
      `<div id="${id}" style="display:${open ? "block" : "none"}">` +
      rows.map((r) =>
        `<div style="display:flex;gap:.5rem;padding:.28rem .55rem;border-top:1px solid #202028;font-size:12px">` +
        `<span style="color:#9ca3af;flex:0 0 45%;word-break:break-word">${esc(r.name)}</span>` +
        `<span style="flex:1;word-break:break-word" title="click to copy">${esc(r.value)}</span></div>`,
      ).join("") +
      `</div></div>`
    );
  };

  const render = (p: ElementProperties) => {
    const idRows = Object.entries(p.identity)
      .filter(([, v]) => v != null && v !== "")
      .map(([name, value]) => ({ name, value: String(value) }));
    let html = groupHtml("Identity", idRows, "#c4b5fd");
    for (const q of p.quantities) html += groupHtml(q.name, q.rows, "#84cc16");
    for (const ps of p.psets) html += groupHtml(ps.name, ps.rows, "#c9cfda");
    if (!p.psets.length && !p.quantities.length) {
      html += '<div style="color:#9ca3af;font-size:11px;padding:.4rem .55rem">No property or quantity sets on this element.</div>';
    }
    body.innerHTML = html;
    // collapse toggles
    body.querySelectorAll<HTMLElement>(".pp-h").forEach((h) => h.addEventListener("click", () => {
      const t = el(h.dataset.t!); if (t) t.style.display = t.style.display === "none" ? "block" : "none";
    }));
    // click a value to copy
    body.querySelectorAll<HTMLElement>("div[title='click to copy']").forEach((v) =>
      v.addEventListener("click", () => { navigator.clipboard?.writeText(v.textContent ?? "").catch(() => {}); status("Copied."); }));
    const n = p.psets.reduce((a, g) => a + g.rows.length, 0) + p.quantities.reduce((a, g) => a + g.rows.length, 0);
    status(`${p.identity.Class ?? "Element"} · ${p.psets.length} pset(s), ${p.quantities.length} qty set(s), ${n} value(s).`);
  };

  const modelFor = (modelId: string) => {
    for (const m of fragments.list.values()) if (m.modelId === modelId) return m;
    return undefined;
  };

  async function onSelect(map: Record<string, Set<number>> | undefined) {
    if (!map) return;
    const modelId = Object.keys(map)[0];
    const localId = modelId ? [...(map[modelId] ?? [])][0] : undefined;
    if (!modelId || localId == null) return;
    const model = modelFor(modelId);
    if (!model) { status("Selected element is not in a loaded fragments model."); return; }
    current = { modelId, localId };
    status("Reading properties…");
    try {
      const props = await extractElementProperties(model, localId);
      // Phase-1 checkpoint: the parsed properties are logged for verification.
      // eslint-disable-next-line no-console
      console.log("[Sentinel] element properties", props);
      render(props);
    } catch (e) {
      status("Couldn't read properties: " + ((e as Error)?.message ?? String(e)));
    }
  }

  // Subscribe to the Highlighter's select-style events (click selection in the viewer's Select mode).
  // Defensive: the event object shape can vary across OBF versions.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hl = highlighter as any;
  const selectEvents = hl?.events?.select;
  selectEvents?.onHighlight?.add((map: Record<string, Set<number>>) => onSelect(map));
  selectEvents?.onClear?.add(() => { current = null; empty(); });

  // Isolate / show-all. Mirrors hider.ts: isolate(sel) / set(true), then refresh the view
  // (visibility changes only render after fragments.core.update).
  const refresh = async () => { try { await fragments.core.update(true); } catch { /* */ } };
  el("pp-iso").addEventListener("click", async () => {
    if (!current) { status("Select an element first."); return; }
    try {
      const m: OBC.ModelIdMap = { [current.modelId]: new Set([current.localId]) };
      await hider.isolate(m);
      await refresh();
      status("Isolated — press “Show all” to restore.");
    } catch (e) { status("Isolate failed: " + ((e as Error)?.message ?? String(e))); }
  });
  el("pp-show").addEventListener("click", async () => {
    try { await hider.set(true); await refresh(); status("Showing all."); }
    catch (e) { status("Show all failed: " + ((e as Error)?.message ?? String(e))); }
  });

  empty();
  return root;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
