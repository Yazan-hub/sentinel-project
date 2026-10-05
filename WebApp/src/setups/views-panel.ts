import * as OBC from "@thatopen/components";
import { SERVICE_URL } from "../config";
import { bfetch, bridgeImage, refusalText } from "./bridge-fetch";
import * as OBF from "@thatopen/components-front";
import { isolateStoreyByName } from "../sentinel-core/adapter/storey-isolate";
import { activePid, onActiveProjectChange } from "./active-project";
import { openLivePlan } from "./live-plan";
import { escapeHtml as esc } from "./escape-html";

/**
 * Sentinel Views viewer. Mirrors the Sheets viewer's mechanism (Revit-only content that doesn't survive
 * IFC export → the plugin renders it to PNG → the Bridge serves it), but for named Revit views instead of
 * sheets — and curated, not exhaustive: only the views ticked in Revit's Publish Views picker appear here
 * (unlike Sheets, which always publishes every sheet). Views are grouped like the Project Browser (Floor
 * Plans, Ceiling Plans, Elevations, Sections, 3D Views, Drafting Views, …). Opening a Floor/Ceiling Plan
 * offers "isolate this level in 3D" (matched by IfcBuildingStorey name — coordinate-free, so it survives
 * Revit↔IFC base-point offsets). Plain-DOM, iframe-safe.
 */
interface ViewItem { id: string; name: string; type: string; level: string; file: string; url: string; }
interface ViewSet { set: string; title: string; project?: string | null; exportedAt: string | null; count: number; views: ViewItem[]; }

const GROUP_ORDER = [
  "FloorPlan", "CeilingPlan", "Elevation", "Section", "ThreeD",
  "DraftingView", "Detail", "AreaPlan", "Schedule",
];
const GROUP_LABELS: Record<string, string> = {
  FloorPlan: "Floor Plans", CeilingPlan: "Ceiling Plans", Elevation: "Elevations",
  Section: "Sections", ThreeD: "3D Views", DraftingView: "Drafting Views",
  Detail: "Detail Views", AreaPlan: "Area Plans", Schedule: "Schedules",
};
const groupLabel = (t: string) => GROUP_LABELS[t] ?? t.replace(/([a-z])([A-Z])/g, "$1 $2");

export function viewsPanel(components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? SERVICE_URL).replace(/\/$/, "");
  const fragments = components.get(OBC.FragmentsManager);
  const hider = components.get(OBC.Hider);
  const highlighter = components.get(OBF.Highlighter);

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  const btn = "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.3rem .55rem;font:600 11px system-ui;cursor:pointer";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
    '<span style="font-weight:600">▥ Views</span><span style="color:#9ca3af;font-size:11px">published from Revit</span>' +
    '<span style="flex:1"></span>' +
    `<button id="vw-refresh" style="${btn}" title="Reload views from the Bridge">↻</button>` +
    "</div>" +
    '<div id="vw-sets" style="padding:.4rem .6rem;border-bottom:1px solid #2a2a30;display:none"></div>' +
    '<div id="vw-list" style="flex:1;overflow:auto;padding:.35rem"></div>' +
    '<div id="vw-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">…</div>';
  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const status = (t: string) => (el("vw-status").textContent = t);

  let sets: ViewSet[] = [];
  let active = 0;
  let flat: ViewItem[] = []; // active set's views, flattened in the order they're rendered — lightbox nav walks this

  function renderList() {
    const host = el("vw-list");
    const set = sets[active];
    flat = [];
    if (!set || !set.views.length) {
      host.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:.6rem;line-height:1.6">No views published yet.<br><br>In Revit: <b>Sentinel → Publish Views</b> — pick which plans, sections, elevations or 3D views to share, then press ↻ here.</div>';
      return;
    }
    const groups = new Map<string, ViewItem[]>();
    for (const v of set.views) {
      if (!groups.has(v.type)) groups.set(v.type, []);
      groups.get(v.type)!.push(v);
    }
    const orderedTypes = [...groups.keys()].sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    let html = "";
    for (const type of orderedTypes) {
      const items = groups.get(type)!.sort((a, b) => a.name.localeCompare(b.name));
      html += `<div style="font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8b8b95;padding:.5rem .35rem .3rem">${esc(groupLabel(type))} · ${items.length}</div>`;
      for (const v of items) {
        const i = flat.length;
        flat.push(v);
        html +=
          `<div class="vw-row" data-i="${i}" style="display:flex;gap:.5rem;align-items:center;padding:.4rem .45rem;border:1px solid #2a2a30;background:#1b1b22;border-radius:.3rem;margin-bottom:.25rem;cursor:pointer">` +
          `<span style="flex:1;color:#e5e7eb;font-size:12px">${esc(v.name)}</span>` +
          (v.level ? `<span style="color:#a78bfa;font-size:10.5px">${esc(v.level)}</span>` : "") +
          `<span style="color:#6b7280;font-size:11px">open ⤢</span></div>`;
      }
    }
    host.innerHTML = html;
    host.querySelectorAll<HTMLElement>(".vw-row").forEach((r) =>
      r.addEventListener("click", () => openLightbox(Number(r.dataset.i))));
  }

  function renderSets() {
    const box = el("vw-sets");
    if (sets.length <= 1) { box.style.display = "none"; return; }
    box.style.display = "block";
    box.innerHTML = `<select id="vw-set" style="width:100%;background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.3rem .4rem;font:12px system-ui">` +
      sets.map((s, i) => `<option value="${i}">${esc(s.title)} · ${s.count} view(s)</option>`).join("") + "</select>";
    (box.querySelector("#vw-set") as HTMLSelectElement).addEventListener("change", (e) => {
      active = Number((e.target as HTMLSelectElement).value); renderList();
      status(`${sets[active].count} view(s) in “${sets[active].title}”.`);
    });
  }

  async function refresh() {
    status("Loading views from the Bridge…");
    let reached = false; // a network failure is "can't reach"; anything after the bridge answered is its own words
    try {
      const r = await bfetch(`${base}/views`);
      reached = true;
      // A refused list is said in the bridge's words — shown empty it would read as "nothing published" (D7).
      const refused = await refusalText(r);
      if (refused) {
        sets = []; renderSets();
        el("vw-list").innerHTML = `<div style="color:#fbbf24;font-size:12px;padding:.6rem;line-height:1.6">${esc(refused)}</div>`;
        status(refused);
        return;
      }
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || `HTTP ${r.status}`);
      const data = await r.json() as { sets: ViewSet[] };
      // Project-scoped: sets published against a specific web project only show inside that project.
      // Sets without a project field (older plugin) stay visible everywhere — back-compat.
      sets = (data.sets ?? []).filter((s) => !s.project || s.project === activePid());
      active = 0;
      renderSets(); renderList();
      const total = sets.reduce((a, s) => a + s.count, 0);
      status(sets.length
        ? `${total} view(s) across ${sets.length} model(s). Click a view; plans offer "isolate level in 3D".`
        : "No views published. Use Revit → Sentinel → Publish Views.");
    } catch (e) {
      // Not read is said as not read — renderList() here would show "No views published yet" (a failed read as empty).
      const m = (e as Error)?.message ?? String(e);
      const why = reached ? m : `can't reach the bridge (${m})`;
      sets = []; renderSets();
      el("vw-list").innerHTML = `<div style="color:#fbbf24;font-size:12px;padding:.6rem;line-height:1.6">Views not read — ${esc(why)}</div>`;
      status(reached ? `Views not read — ${m}` : `Couldn't reach the Bridge (${m}). Start it: node bridge/bcf-service.mjs`);
    }
  }

  async function isolateLevel(level: string, closeLb: () => void) {
    if (!level) return;
    if (fragments.list.size === 0) { status("Load the 3D model first, then try again."); return; }
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

  // ── Full-screen zoom/pan lightbox ──
  let lb: HTMLElement | null = null;
  function openLightbox(i: number) {
    if (!flat.length) return;
    let idx = i;
    let scale = 1, tx = 0, ty = 0, dragging = false, lx = 0, ly = 0;

    lb = document.createElement("div");
    lb.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(8,8,10,.94);display:flex;flex-direction:column;font:13px system-ui;color:#eee";
    lb.innerHTML =
      '<div style="display:flex;align-items:center;gap:.6rem;padding:.5rem .8rem;border-bottom:1px solid #2a2a30;background:#111">' +
      '<span id="lb-cap" style="font-weight:600"></span>' +
      '<span style="flex:1"></span>' +
      `<button id="lb-isolate" style="${btn};background:#241a3a;border-color:#6d28d9;color:#c4b5fd;display:none">⛶ Isolate level</button>` +
      `<button id="lb-live" style="${btn};background:#241a3a;border-color:#6d28d9;color:#c4b5fd;display:none" title="Open this level as a live plan of the loaded models (the engine’s Views)">▦ Live plan</button>` +
      `<button id="lb-prev" style="${btn}">◀ Prev</button>` +
      `<button id="lb-next" style="${btn}">Next ▶</button>` +
      `<button id="lb-fit" style="${btn}">Fit</button>` +
      `<button id="lb-close" style="${btn};background:#3a1f1f;border-color:#7f1d1d;color:#fca5a5">✕ Close</button>` +
      "</div>" +
      '<div id="lb-stage" style="flex:1;overflow:hidden;position:relative;cursor:grab;display:flex;align-items:center;justify-content:center">' +
      '<img id="lb-img" draggable="false" style="display:block;max-width:none;user-select:none;box-shadow:0 0 40px rgba(0,0,0,.6);background:#fff;transform-origin:center center"/>' +
      "</div>";
    document.body.appendChild(lb);
    const q = (id: string) => lb!.querySelector("#" + id) as HTMLElement;
    const img = q("lb-img") as HTMLImageElement;
    const stage = q("lb-stage");
    const isolateBtn = q("lb-isolate");
    const liveBtn = q("lb-live");

    const apply = () => { img.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; };
    const fit = () => { scale = 1; tx = 0; ty = 0; apply(); };

    let objUrl = "";
    let seq = 0;
    const load = () => {
      const v = flat[idx];
      const mine = ++seq;
      q("lb-cap").textContent = `${v.name}  (${idx + 1}/${flat.length})`;
      isolateBtn.style.display = v.level ? "inline-block" : "none";
      liveBtn.style.display = v.level ? "inline-block" : "none";
      img.onload = fit;
      // Fetched with the Authorization header: a plain <img src> to the bridge carries no credential.
      bridgeImage(`${base}${v.url}`).then((u) => {
        if (mine !== seq || !lb) { URL.revokeObjectURL(u); return; }
        if (objUrl) URL.revokeObjectURL(objUrl);
        objUrl = u; img.src = u;
      }).catch((e) => { q("lb-cap").textContent = `${v.name} — could not load the view (${(e as Error).message})`; });
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

    const go = (d: number) => { idx = (idx + d + flat.length) % flat.length; load(); };
    q("lb-prev").addEventListener("click", () => go(-1));
    q("lb-next").addEventListener("click", () => go(1));
    q("lb-fit").addEventListener("click", fit);
    q("lb-close").addEventListener("click", close);
    isolateBtn.addEventListener("click", () => void isolateLevel(flat[idx].level, close));
    liveBtn.addEventListener("click", () => { const level = flat[idx].level; close(); void openLivePlan(components, level).then((r) => status(r.message)); });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "ArrowRight") go(1); };
    window.addEventListener("keydown", onKey);

    function close() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
      if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = ""; }
      lb?.remove(); lb = null;
    }
  }

  el("vw-refresh").addEventListener("click", refresh);
  onActiveProjectChange(() => void refresh());
  void refresh();
  return root;
}
