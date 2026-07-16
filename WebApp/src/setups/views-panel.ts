import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { getAppManager } from "../app";

/**
 * Sentinel Saved Views (Phase 2 — Revit "named views"). Save the current camera as a named view and
 * restore it later; plus Zoom-fit. The platform toolbar already covers orbit/pan/zoom/section/walk and
 * the orientation nav-gizmo (Top/Front/…), so this adds the one thing missing: persistent named views
 * per project (localStorage). Uses camera-controls getPosition/getTarget/setLookAt + fitToSphere.
 * Plain-DOM, iframe-safe. Docked as the "Views" tab.
 */
interface SavedView { name: string; pos: [number, number, number]; target: [number, number, number]; }

export function viewsPanel(components: OBC.Components): HTMLElement {
  const worlds = components.get(OBC.Worlds);
  const fragments = components.get(OBC.FragmentsManager);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const world = (): any => [...worlds.list.values()][0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = (): any => world()?.camera?.controls;
  const pid = () => getAppManager().client?.context?.projectId ?? "default";
  const key = () => `sentinel:views:${pid()}`;

  const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  let views: SavedView[] = [];
  try { views = JSON.parse(localStorage.getItem(key()) || "[]"); } catch { views = []; }
  const persist = () => { try { localStorage.setItem(key(), JSON.stringify(views)); } catch { /* */ } };

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  const btn = "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.35rem .55rem;font:600 12px system-ui;cursor:pointer";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
    '<span style="font-weight:600">◳ Views</span><span style="color:#9ca3af;font-size:11px">named cameras</span>' +
    '<span style="flex:1"></span>' +
    `<button id="vw-fit" style="${btn}" title="Zoom to fit the model">Fit</button>` +
    "</div>" +
    '<div style="display:flex;gap:.35rem;padding:.5rem .6rem;border-bottom:1px solid #2a2a30">' +
    `<input id="vw-name" placeholder="View name…" style="flex:1;background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.35rem .5rem;font:12px system-ui"/>` +
    `<button id="vw-save" style="${btn};background:#6528d7;color:#fff;border-color:#6528d7">Save view</button>` +
    "</div>" +
    '<div id="vw-list" style="flex:1;overflow:auto;padding:.4rem .6rem;display:flex;flex-direction:column;gap:.3rem"></div>' +
    '<div id="vw-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">Save the current camera as a named view.</div>';
  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const status = (t: string) => (el("vw-status").textContent = t);

  function renderList() {
    const host = el("vw-list");
    host.innerHTML = "";
    if (!views.length) { host.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:.4rem">No saved views yet.</div>'; return; }
    views.forEach((v, i) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:.4rem;border:1px solid #26262e;border-radius:.35rem;padding:.35rem .5rem;background:#1b1b21";
      const name = document.createElement("span");
      name.style.cssText = "flex:1;font-size:12px;cursor:pointer;color:#e5e7eb";
      name.textContent = v.name;
      name.title = "Go to this view";
      name.addEventListener("click", () => restore(v));
      const del = document.createElement("button");
      del.textContent = "✕";
      del.style.cssText = "border:0;background:transparent;color:#f87171;cursor:pointer";
      del.addEventListener("click", () => { views.splice(i, 1); persist(); renderList(); });
      row.append(name, del);
      host.appendChild(row);
    });
  }

  function saveView() {
    const c = controls();
    if (!c?.getPosition) { status("Viewer not ready."); return; }
    const name = (el("vw-name") as HTMLInputElement).value.trim() || `View ${views.length + 1}`;
    const p = new THREE.Vector3(), t = new THREE.Vector3();
    c.getPosition(p); c.getTarget(t);
    views.push({ name, pos: [p.x, p.y, p.z], target: [t.x, t.y, t.z] });
    persist();
    (el("vw-name") as HTMLInputElement).value = "";
    renderList();
    status(`Saved “${name}”.`);
  }

  function restore(v: SavedView) {
    const c = controls();
    if (!c?.setLookAt) { status("Viewer not ready."); return; }
    c.setLookAt(v.pos[0], v.pos[1], v.pos[2], v.target[0], v.target[1], v.target[2], true);
    status(`→ ${v.name}`);
  }

  async function fit() {
    const c = controls();
    const s: THREE.Scene | undefined = world()?.scene?.three;
    if (!c || !s) { status("Viewer not ready."); return; }
    try {
      const box = new THREE.Box3();
      for (const model of fragments.list.values()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obj = (model as any).object ?? (model as any).three;
        if (obj) box.expandByObject(obj);
      }
      if (box.isEmpty()) box.setFromObject(s);
      if (box.isEmpty()) { status("Nothing to fit."); return; }
      if (c.fitToBox) await c.fitToBox(box, true);
      else {
        const ctr = box.getCenter(new THREE.Vector3());
        const r = box.getSize(new THREE.Vector3()).length() || 10;
        c.setLookAt(ctr.x + r, ctr.y + r * 0.8, ctr.z + r, ctr.x, ctr.y, ctr.z, true);
      }
      status("Zoomed to fit.");
    } catch (e) { status("Fit failed: " + ((e as Error)?.message ?? String(e))); }
  }

  el("vw-save").addEventListener("click", saveView);
  el("vw-fit").addEventListener("click", fit);
  el("vw-name").addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") saveView(); });
  renderList();
  return root;
}
