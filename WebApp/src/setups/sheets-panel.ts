import * as OBC from "@thatopen/components";
import { bfetch } from "./bridge-fetch";
import * as OBF from "@thatopen/components-front";
import { isolateStoreyByName } from "../sentinel-core/adapter/storey-isolate";

/**
 * Sentinel Sheets viewer. Revit sheets (titleblock + viewports + annotations) never survive IFC export, so
 * the Revit plugin renders each ViewSheet to a PNG and the Bridge serves them at GET /sheets. This panel
 * lists the sheets and opens the selected one in a full-screen zoom/pan lightbox. Each viewport is a hotspot:
 * click a plan viewport → the 3D model isolates that level (matched by IfcBuildingStorey name — coordinate-
 * free, so it survives Revit↔IFC base-point offsets). Plain-DOM, iframe-safe.
 */
interface Viewport { view: string; type: string; level: string; fx: number; fy: number; fw: number; fh: number; }
interface SheetItem { id: string; number: string; name: string; file: string; url: string; viewports?: Viewport[]; }
interface SheetSet { set: string; title: string; exportedAt: string | null; count: number; sheets: SheetItem[]; }

export function sheetsPanel(components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? "http://localhost:4100").replace(/\/$/, "");
  const fragments = components.get(OBC.FragmentsManager);
  const hider = components.get(OBC.Hider);
  const highlighter = components.get(OBF.Highlighter);
  const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  const btn = "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.3rem .55rem;font:600 11px system-ui;cursor:pointer";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
    '<span style="font-weight:600">▤ Sheets</span><span style="color:#9ca3af;font-size:11px">from Revit</span>' +
    '<span style="flex:1"></span>' +
    `<button id="sh-refresh" style="${btn}" title="Reload sheets from the Bridge">↻</button>` +
    "</div>" +
    '<div id="sh-sets" style="padding:.4rem .6rem;border-bottom:1px solid #2a2a30;display:none"></div>' +
    '<div id="sh-list" style="flex:1;overflow:auto;padding:.35rem"></div>' +
    '<div id="sh-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">…</div>';
  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const status = (t: string) => (el("sh-status").textContent = t);

  let sets: SheetSet[] = [];
  let active = 0;

  function renderList() {
    const host = el("sh-list");
    const set = sets[active];
    if (!set || !set.sheets.length) {
      host.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:.6rem;line-height:1.6">No sheets published yet.<br><br>In Revit: <b>Sentinel → Publish Sheets</b> (sheets aren\'t in the IFC, so they\'re rendered and pushed separately). Make sure the Bridge is running, then press ↻.</div>';
      return;
    }
    host.innerHTML = set.sheets.map((s, i) =>
      `<div class="sh-row" data-i="${i}" style="display:flex;gap:.5rem;align-items:center;padding:.4rem .45rem;border:1px solid #2a2a30;background:#1b1b22;border-radius:.3rem;margin-bottom:.25rem;cursor:pointer">` +
      `<span style="color:#c4b5fd;font-weight:600;min-width:4.5rem">${esc(s.number)}</span>` +
      `<span style="flex:1;color:#e5e7eb;font-size:12px">${esc(s.name)}</span>` +
      `<span style="color:#6b7280;font-size:11px">open ⤢</span></div>`,
    ).join("");
    host.querySelectorAll<HTMLElement>(".sh-row").forEach((r) =>
      r.addEventListener("click", () => openLightbox(Number(r.dataset.i))));
  }

  function renderSets() {
    const box = el("sh-sets");
    if (sets.length <= 1) { box.style.display = "none"; return; }
    box.style.display = "block";
    box.innerHTML = `<select id="sh-set" style="width:100%;background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.3rem .4rem;font:12px system-ui">` +
      sets.map((s, i) => `<option value="${i}">${esc(s.title)} · ${s.count} sheet(s)</option>`).join("") + "</select>";
    (box.querySelector("#sh-set") as HTMLSelectElement).addEventListener("change", (e) => {
      active = Number((e.target as HTMLSelectElement).value); renderList();
      status(`${sets[active].count} sheet(s) in “${sets[active].title}”.`);
    });
  }

  async function refresh() {
    status("Loading sheets from the Bridge…");
    try {
      const r = await bfetch(`${base}/sheets`);
      if (!r.ok) throw new Error(`Bridge ${r.status}`);
      const data = await r.json() as { sets: SheetSet[] };
      sets = data.sets ?? [];
      active = 0;
      renderSets(); renderList();
      const total = sets.reduce((a, s) => a + s.count, 0);
      status(sets.length
        ? `${total} sheet(s) across ${sets.length} model(s). Click a sheet, then click a plan on it to isolate that level in 3D.`
        : "No sheets published. Use Revit → Sentinel → Publish Sheets.");
    } catch (e) {
      sets = []; renderList();
      status("Couldn't reach the Bridge (" + ((e as Error)?.message ?? String(e)) + "). Start it: node bridge/bcf-service.mjs");
    }
  }

  // Click a plan viewport → isolate its level in the 3D model (name match against IfcBuildingStorey).
  async function isolateLevel(level: string, closeLb: () => void) {
    if (!level) { status("This viewport isn't a plan tied to a level — nothing to isolate."); return; }
    if (fragments.list.size === 0) { status("Load the 3D model first, then click the plan again."); return; }
    status(`Isolating level “${level}” in the 3D model…`);
    try {
      const res = await isolateStoreyByName(fragments, level);
      if (!res.matched || res.count === 0) {
        const hint = res.storeys.length ? ` Levels in the model: ${[...new Set(res.storeys)].slice(0, 8).join(", ")}.` : "";
        status(`No level matching “${level}” found in the 3D model.${hint}`);
        return;
      }
      closeLb();
      await hider.set(true);
      await hider.isolate(res.map);
      await fragments.core.update(true);
      await highlighter.highlightByID("select", res.map, true, true); // zooms to the isolated level
      status(`Isolated level “${res.matched}” — ${res.count} element(s). Show all in Visibility to restore.`);
    } catch (e) { status("Isolate failed: " + ((e as Error)?.message ?? String(e))); }
  }

  // ── Full-screen zoom/pan lightbox with clickable viewport hotspots ──
  let lb: HTMLElement | null = null;
  function openLightbox(i: number) {
    const set = sets[active];
    if (!set) return;
    let idx = i;
    let scale = 1, tx = 0, ty = 0, dragging = false, lx = 0, ly = 0;

    lb = document.createElement("div");
    lb.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(8,8,10,.94);display:flex;flex-direction:column;font:13px system-ui;color:#eee";
    lb.innerHTML =
      '<div style="display:flex;align-items:center;gap:.6rem;padding:.5rem .8rem;border-bottom:1px solid #2a2a30;background:#111">' +
      '<span id="lb-cap" style="font-weight:600"></span>' +
      '<span id="lb-hint" style="color:#9ca3af;font-size:11px"></span><span style="flex:1"></span>' +
      '<button id="lb-prev" style="' + btn + '">◀ Prev</button>' +
      '<button id="lb-next" style="' + btn + '">Next ▶</button>' +
      '<button id="lb-fit" style="' + btn + '">Fit</button>' +
      '<button id="lb-close" style="' + btn + ';background:#3a1f1f;border-color:#7f1d1d;color:#fca5a5">✕ Close</button>' +
      "</div>" +
      '<div id="lb-stage" style="flex:1;overflow:hidden;position:relative;cursor:grab;display:flex;align-items:center;justify-content:center">' +
      '<div id="lb-canvas" style="position:relative;transform-origin:center center">' +
      '<img id="lb-img" draggable="false" style="display:block;max-width:none;user-select:none;box-shadow:0 0 40px rgba(0,0,0,.6);background:#fff"/>' +
      "</div></div>";
    document.body.appendChild(lb);
    const q = (id: string) => lb!.querySelector("#" + id) as HTMLElement;
    const img = q("lb-img") as HTMLImageElement;
    const canvas = q("lb-canvas");
    const stage = q("lb-stage");

    const apply = () => { canvas.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; };
    const fit = () => { scale = 1; tx = 0; ty = 0; apply(); };

    function drawHotspots() {
      canvas.querySelectorAll(".lb-hot").forEach((n) => n.remove());
      const s = set.sheets[idx];
      const vps = s.viewports ?? [];
      q("lb-hint").textContent = vps.some((v) => v.level) ? "Click a plan to isolate its level in 3D" : "";
      for (const v of vps) {
        const hot = document.createElement("div");
        hot.className = "lb-hot";
        const planned = !!v.level;
        hot.style.cssText =
          `position:absolute;left:${v.fx * 100}%;top:${v.fy * 100}%;width:${v.fw * 100}%;height:${v.fh * 100}%;` +
          `box-sizing:border-box;border:2px solid ${planned ? "rgba(139,92,246,.0)" : "rgba(120,120,130,0)"};` +
          `cursor:${planned ? "pointer" : "default"};transition:background .1s,border-color .1s`;
        hot.title = v.level ? `${v.view} · isolate level “${v.level}” in 3D` : `${v.view} (${v.type})`;
        hot.addEventListener("mouseenter", () => { hot.style.background = planned ? "rgba(139,92,246,.18)" : "rgba(120,120,130,.1)"; hot.style.borderColor = planned ? "rgba(139,92,246,.9)" : "rgba(120,120,130,.5)"; });
        hot.addEventListener("mouseleave", () => { hot.style.background = "transparent"; hot.style.borderColor = "transparent"; });
        hot.addEventListener("mousedown", (e) => e.stopPropagation()); // don't start a pan when clicking a hotspot
        hot.addEventListener("click", (e) => { e.stopPropagation(); void isolateLevel(v.level, close); });
        canvas.appendChild(hot);
      }
    }

    const load = () => {
      const s = set.sheets[idx];
      q("lb-cap").textContent = `${s.number} — ${s.name}  (${idx + 1}/${set.sheets.length})`;
      img.onload = () => { drawHotspots(); fit(); };
      img.src = `${base}${s.url}`;
    };
    load();

    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      const f = (e as WheelEvent).deltaY < 0 ? 1.15 : 1 / 1.15;
      scale = Math.min(12, Math.max(0.2, scale * f));
      apply();
    }, { passive: false });
    stage.addEventListener("mousedown", (e) => { dragging = true; lx = (e as MouseEvent).clientX; ly = (e as MouseEvent).clientY; stage.style.cursor = "grabbing"; });
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    function onMove(e: MouseEvent) { if (!dragging) return; tx += e.clientX - lx; ty += e.clientY - ly; lx = e.clientX; ly = e.clientY; apply(); }
    function onUp() { dragging = false; if (lb) stage.style.cursor = "grab"; }

    const go = (d: number) => { idx = (idx + d + set.sheets.length) % set.sheets.length; load(); };
    q("lb-prev").addEventListener("click", () => go(-1));
    q("lb-next").addEventListener("click", () => go(1));
    q("lb-fit").addEventListener("click", fit);
    q("lb-close").addEventListener("click", close);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "ArrowRight") go(1); };
    window.addEventListener("keydown", onKey);

    function close() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
      lb?.remove(); lb = null;
    }
  }

  el("sh-refresh").addEventListener("click", refresh);
  void refresh();
  return root;
}
