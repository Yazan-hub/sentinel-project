import * as THREE from "three";
import { activePid } from "./active-project";
import * as OBC from "@thatopen/components";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { getAppManager } from "../app";
import { buildIfc, type BakeElement } from "../sentinel-core/ifc-writer";
import { bfetch } from "./bridge-fetch";

/**
 * Sentinel 3D Modeling studio — in-browser authoring + editing + markup on top of the That Open world.
 *
 * The platform viewer is view-first; this panel adds the three things a modeller needs on top of it,
 * all against the SAME OBC world (world.scene.three / world.camera / world.renderer):
 *   1. AUTHOR   — draw walls (2 clicks), place columns (1 click), draw slabs (2-corner). Parametric
 *                 boxes into a "Sentinel Model" group; dimensions come from the panel's inputs.
 *   2. EDIT     — select an authored element and move/rotate/scale it with a three TransformControls
 *                 gizmo (camera controls auto-disable while dragging), or delete it.
 *   3. MEASURE  — 2-click length readout, and place text NOTES (a pin + a listed note) anywhere on the
 *      + MARKUP   model. (Precise snapped Length/Area/Angle + clipping already live in the viewer toolbar;
 *                 this is the lightweight, self-contained complement.)
 *
 * Rendering note: the platform runs a DEFERRED pipeline that hides plain lines (see measurement-tool.ts).
 * So the measure segment is a thin CYLINDER mesh, not a Line — meshes render like normal geometry and
 * stay visible. Authored elements + notes persist to localStorage per project, so a sketch survives reload.
 *
 * Browser-interaction only (canvas picking, gizmo) — verified by build; drive it in the live app to test.
 */

type Kind = "wall" | "column" | "slab";
type Mode = "select" | Kind | "note" | "measure";

interface Authored {
  id: string;
  kind: Kind;
  mesh: THREE.Mesh;
  params: Record<string, number>;
}
interface Note {
  id: string;
  text: string;
  pos: [number, number, number];
  pin: THREE.Mesh;
}
interface MeasureItem {
  id: string;
  dist: number;
  objs: THREE.Object3D[];
}

const ACCENT = 0x6528d7;
const KIND_COLOR: Record<Kind, number> = { wall: 0xb4bac6, column: 0x8a94a6, slab: 0x9aa3b2 };

export function modelPanel(components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? "http://localhost:4100").replace(/\/$/, "");
  const projectId = () => activePid();
  const storeKey = () => `sentinel:model:${projectId()}`;
  const verKey = () => `sentinel:model:ver:${projectId()}`;

  // ── world handles (resolved lazily; the world exists by the time a tab is opened) ──
  const getWorld = () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [...components.get(OBC.Worlds).list.values()][0] as any | undefined;
  const scene = (): THREE.Scene | undefined => getWorld()?.scene?.three;
  const camera = (): THREE.Camera | undefined =>
    getWorld()?.camera?.three ?? getWorld()?.camera?.threePersp;
  const canvas = (): HTMLCanvasElement | undefined =>
    getWorld()?.renderer?.three?.domElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = (): any => getWorld()?.camera?.controls;
  const render = () => getWorld()?.renderer?.update?.();

  // ── state ──
  const group = new THREE.Group();
  group.name = "Sentinel Model";
  const authored: Authored[] = [];
  const notes: Note[] = [];
  const measures: MeasureItem[] = [];
  let mode: Mode = "select";
  let selected: Authored | null = null;
  let pending: THREE.Vector3 | null = null; // first click of a 2-click tool
  let pendingMarker: THREE.Mesh | null = null; // visible dot at the first click
  let gizmo: TransformControls | null = null;
  let seq = 0;
  let wired = false;
  const uid = (p: string) => `${p}${++seq}`;

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // The world runs a DEFERRED pen renderer whose single-pass capture hides plain (non-emitter) meshes.
  // To make our geometry visible we must register its materials into the postproduction overlay set —
  // the same mechanism the grid / clip sections / measurement lines use (see measurement-tool.ts).
  const myMaterials = new Set<THREE.Material>();
  function registerForRender(m: THREE.Material) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isolated = (getWorld()?.renderer as any)?.postproduction?.basePass?.isolatedMaterials;
      if (Array.isArray(isolated) && !isolated.includes(m)) isolated.push(m);
    } catch { /* postproduction not ready yet */ }
  }
  function track<T extends THREE.Material>(m: T): T { myMaterials.add(m); registerForRender(m); return m; }

  // ── dimension inputs (metres) ──
  const dims = { height: 3, thickness: 0.2, colW: 0.4, colD: 0.4, slab: 0.3 };

  // ── DOM ──
  const root = document.createElement("div");
  root.style.cssText =
    "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  const btn =
    "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.4rem .55rem;font:600 12px system-ui;cursor:pointer";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
    '<span style="font-weight:600">▲ Model</span>' +
    '<span style="color:#9ca3af;font-size:11px">author · edit · markup</span>' +
    '<span style="flex:1"></span>' +
    `<button id="md-fit" style="${btn}" title="Frame the camera on your elements">Fit ⤢</button>` +
    `<button id="md-clear" style="${btn}" title="Remove everything Sentinel authored">Clear</button>` +
    "</div>" +
    '<div id="md-body" style="flex:1;overflow:auto;padding:.6rem;display:flex;flex-direction:column;gap:.75rem"></div>' +
    '<div id="md-status" style="padding:.45rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">Ready.</div>';
  const body = root.querySelector("#md-body") as HTMLElement;
  const statusEl = root.querySelector("#md-status") as HTMLElement;
  const status = (t: string) => (statusEl.textContent = t);

  const section = (title: string): HTMLElement => {
    const s = document.createElement("div");
    s.innerHTML = `<div style="font-weight:600;color:#c9cfda;margin-bottom:.4rem">${title}</div>`;
    const inner = document.createElement("div");
    inner.style.cssText = "display:flex;flex-wrap:wrap;gap:.35rem;align-items:center";
    s.appendChild(inner);
    body.appendChild(s);
    return inner;
  };
  const tool = (label: string, m: Mode, host: HTMLElement) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.dataset.mode = m;
    b.style.cssText = btn;
    b.addEventListener("click", () => setMode(mode === m ? "select" : m));
    host.appendChild(b);
    return b;
  };
  const numField = (label: string, key: keyof typeof dims, host: HTMLElement) => {
    const w = document.createElement("label");
    w.style.cssText = "display:inline-flex;align-items:center;gap:.25rem;color:#9ca3af;font-size:11px";
    const inp = document.createElement("input");
    inp.type = "number";
    inp.step = "0.05";
    inp.min = "0.05";
    inp.value = String(dims[key]);
    inp.style.cssText =
      "width:3.4rem;background:#111;color:#eee;border:1px solid #333;border-radius:.25rem;padding:.2rem .3rem;font:12px system-ui";
    inp.addEventListener("change", () => {
      const v = parseFloat(inp.value);
      if (v > 0) dims[key] = v;
    });
    w.append(`${label} `, inp, "m");
    host.appendChild(w);
  };

  // Create
  const createRow = section("Create");
  tool("Wall", "wall", createRow);
  tool("Column", "column", createRow);
  tool("Slab", "slab", createRow);
  const dimRow = section("Dimensions");
  numField("Height", "height", dimRow);
  numField("Wall thk", "thickness", dimRow);
  numField("Col W", "colW", dimRow);
  numField("Col D", "colD", dimRow);
  numField("Slab thk", "slab", dimRow);

  // Edit
  const editRow = section("Edit");
  const moveBtn = mkGizmoBtn("Move", "translate", editRow);
  const rotBtn = mkGizmoBtn("Rotate", "rotate", editRow);
  const scaleBtn = mkGizmoBtn("Scale", "scale", editRow);
  const delBtn = document.createElement("button");
  delBtn.textContent = "Delete";
  delBtn.style.cssText = btn + ";color:#f9a8a8";
  delBtn.addEventListener("click", deleteSelected);
  editRow.appendChild(delBtn);

  // Measure & markup
  const measureRow = section("Measure & markup");
  tool("Measure length", "measure", measureRow);
  tool("Add note", "note", measureRow);
  const notesList = document.createElement("div");
  notesList.style.cssText = "display:flex;flex-direction:column;gap:.25rem;width:100%;margin-top:.35rem";
  measureRow.appendChild(notesList);

  // Export to BIM — bake the authored meshes into a real IFC4 file (typed + GUID'd + Qto quantities).
  const bakeRow = section("Export to BIM");
  const bakeBtn = document.createElement("button");
  bakeBtn.textContent = "Bake to IFC ⬇";
  bakeBtn.style.cssText = btn + ";background:#22303a;border-color:#2f6d8a;color:#bfe3f2";
  bakeBtn.addEventListener("click", bakeToIfc);
  bakeRow.appendChild(bakeBtn);
  const uploadBtn = document.createElement("button");
  uploadBtn.textContent = "Bake & Upload ☁";
  uploadBtn.style.cssText = btn + ";background:#2a1e4d;border-color:#6528d7;color:#c4b5fd";
  uploadBtn.addEventListener("click", bakeUpload);
  bakeRow.appendChild(uploadBtn);
  const bakeHint = document.createElement("div");
  bakeHint.style.cssText = "font-size:11px;color:#9ca3af;margin-top:.35rem;width:100%";
  bakeHint.textContent =
    "Baked IFC is real BIM — typed, GUID'd, with Qto quantities (cost / carbon / QA read it). Download to import via Assets, or upload straight to the platform via the bridge.";
  bakeRow.appendChild(bakeHint);

  function mkGizmoBtn(label: string, gmode: "translate" | "rotate" | "scale", host: HTMLElement) {
    const b = document.createElement("button");
    b.textContent = label;
    b.dataset.gmode = gmode;
    b.style.cssText = btn;
    b.addEventListener("click", () => {
      if (!selected) { status("Select an authored element first."); return; }
      ensureGizmo();
      if (gizmo) { gizmo.setMode(gmode); gizmo.attach(selected.mesh); }
      refreshButtons();
      render();
    });
    host.appendChild(b);
    return b;
  }

  // ── mode + button highlighting ──
  function setMode(next: Mode) {
    mode = next;
    pending = null;
    clearPendingMarker();
    if (next !== "select") deselect();
    const c = canvas();
    if (c) c.style.cursor = next === "select" ? "" : "crosshair";
    status(
      next === "select" ? "Select mode — click an authored element to edit it." :
      next === "wall" ? "Wall: click start, then end." :
      next === "column" ? "Column: click to place." :
      next === "slab" ? "Slab: click two opposite corners." :
      next === "note" ? "Note: click a point to pin a note." :
      "Measure: click two points.",
    );
    refreshButtons();
  }
  function refreshButtons() {
    root.querySelectorAll<HTMLButtonElement>("button[data-mode]").forEach((b) => {
      const on = b.dataset.mode === mode;
      b.style.background = on ? "#2a1e4d" : "#1f1f27";
      b.style.borderColor = on ? "#6528d7" : "#2c2c34";
    });
    // TransformControls exposes `.mode` as a property (mirrors reality-capture-viewer's usage).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gmode = gizmo && selected ? (gizmo as any).mode : "";
    root.querySelectorAll<HTMLButtonElement>("button[data-gmode]").forEach((b) => {
      const on = !!selected && b.dataset.gmode === gmode;
      b.style.opacity = selected ? "1" : "0.5";
      b.style.borderColor = on ? "#6528d7" : "#2c2c34";
    });
    delBtn.style.opacity = selected ? "1" : "0.5";
  }

  // ── ensure scene wiring once (group in scene, gizmo, canvas listeners) ──
  function ensure(): boolean {
    const s = scene();
    const c = canvas();
    if (!s || !c) return false;
    if (wired) return true;
    if (!group.parent) s.add(group);
    c.addEventListener("pointerdown", onDown);
    c.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    // Re-register our materials every frame — postproduction may not be ready at wire time, and the
    // overlay set can be rebuilt. Cheap + idempotent (mirrors measurement-tool's onBeforeUpdate hook).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (getWorld()?.renderer as any)?.onBeforeUpdate?.add?.(() => { for (const m of myMaterials) registerForRender(m); });
    wired = true;
    loadFromStore();
    render();
    return true;
  }
  function ensureGizmo() {
    if (gizmo || !ensure()) return;
    const cam = camera();
    const c = canvas();
    if (!cam || !c) return;
    gizmo = new TransformControls(cam, c);
    // three r169+: the control itself isn't an Object3D — add its helper to the scene.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const helper = (gizmo as any).getHelper ? (gizmo as any).getHelper() : gizmo;
    helper.userData.sentinelHelper = true;
    scene()?.add(helper);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gizmo.addEventListener("dragging-changed", (e: any) => {
      const ctl = controls();
      if (ctl) ctl.enabled = !e.value;
      if (!e.value) { syncSelectedParams(); saveToStore(); }
    });
    gizmo.addEventListener("change", () => render());
  }

  // ── pointer: distinguish click from orbit-drag ──
  let downX = 0, downY = 0, downT = 0;
  function onDown(e: PointerEvent) { downX = e.clientX; downY = e.clientY; downT = performance.now(); }
  function onUp(e: PointerEvent) {
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (moved > 5 || performance.now() - downT > 600) return; // a drag / long-press → let the viewer have it
    onClick(e);
  }

  function toNdc(e: PointerEvent) {
    const c = canvas()!;
    const r = c.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }
  /** Point under the cursor: nearest real surface, else the ground plane. */
  function pickPoint(e: PointerEvent): THREE.Vector3 | null {
    const cam = camera();
    if (!cam) return null;
    toNdc(e);
    raycaster.setFromCamera(ndc, cam);
    const s = scene();
    if (s) {
      const hits = raycaster.intersectObjects(s.children, true);
      const hit = hits.find((h) => !isHelper(h.object));
      if (hit) return hit.point.clone();
    }
    const p = new THREE.Vector3();
    return raycaster.ray.intersectPlane(groundPlane, p) ? p.clone() : null;
  }
  function pickAuthored(e: PointerEvent): Authored | null {
    const cam = camera();
    if (!cam) return null;
    toNdc(e);
    raycaster.setFromCamera(ndc, cam);
    const hits = raycaster.intersectObjects(group.children, false);
    if (!hits.length) return null;
    return authored.find((a) => a.mesh === hits[0].object) ?? null;
  }
  function isHelper(o: THREE.Object3D): boolean {
    let n: THREE.Object3D | null = o;
    while (n) { if (n.userData?.sentinelHelper) return true; n = n.parent; }
    return false;
  }

  function onClick(e: PointerEvent) {
    if (!ensure()) return;
    if (mode === "select") {
      const a = pickAuthored(e);
      if (a) select(a); else deselect();
      return;
    }
    const p = pickPoint(e);
    if (!p) { status("Couldn't hit a surface — try again."); return; }

    if (mode === "column") { addColumn(p); return; }
    if (mode === "note") { addNote(p); return; }

    // two-click tools (wall / slab / measure)
    if (!pending) {
      setPending(p);
      status(mode === "measure" ? "Point 1 set (green dot) — click the second point."
                                : `Start set (green dot) — click the ${mode}'s end point.`);
      return;
    }
    const a0 = pending; pending = null; clearPendingMarker();
    if (mode === "wall") addWall(a0, p);
    else if (mode === "slab") addSlab(a0, p);
    else if (mode === "measure") addMeasure(a0, p);
  }

  function onKey(e: KeyboardEvent) {
    if (e.code === "Escape") { pending = null; setMode("select"); }
    else if ((e.code === "Delete" || e.code === "Backspace") && selected) deleteSelected();
  }

  // ── authoring ──
  // Unlit material: the world runs a deferred "pen" renderer with no THREE lights, so a
  // MeshStandardMaterial renders near-black (invisible). MeshBasic shows its flat colour and still
  // gets the pen edge outlines for depth. Double-sided so thin slabs/walls read from any angle.
  function mat(kind: Kind) {
    return track(new THREE.MeshBasicMaterial({ color: KIND_COLOR[kind], side: THREE.DoubleSide }));
  }
  function place(kind: Kind, geo: THREE.BufferGeometry, pos: THREE.Vector3, rotY = 0, params: Record<string, number> = {}) {
    const mesh = new THREE.Mesh(geo, mat(kind));
    mesh.position.copy(pos);
    mesh.rotation.y = rotY;
    mesh.userData.sentinel = true;
    group.add(mesh);
    const rec: Authored = { id: uid(kind), kind, mesh, params };
    authored.push(rec);
    saveToStore();
    render();
    // Don't auto-select (that popped the gizmo up on every create). Stay in the tool to keep placing;
    // use the Select tool to grab an element and edit it.
    if (authored.length === 1) frameAuthored(); // frame the first element so it's immediately visible
    status(`✓ ${kind} added (${authored.length} total). Keep placing, or press "Fit ⤢" to frame them.`);
  }

  function setPending(p: THREE.Vector3) {
    clearPendingMarker();
    pending = p;
    pendingMarker = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), track(new THREE.MeshBasicMaterial({ color: 0x22c55e })));
    pendingMarker.position.copy(p);
    pendingMarker.userData.sentinelHelper = true;
    group.add(pendingMarker);
    render();
  }
  function clearPendingMarker() {
    if (pendingMarker) {
      group.remove(pendingMarker);
      pendingMarker.geometry.dispose();
      (pendingMarker.material as THREE.Material).dispose();
      pendingMarker = null;
    }
  }
  function addWall(a: THREE.Vector3, b: THREE.Vector3) {
    const len = a.distanceTo(b);
    if (len < 1e-3) return;
    const geo = new THREE.BoxGeometry(len, dims.height, dims.thickness);
    const mid = a.clone().add(b).multiplyScalar(0.5).setY(dims.height / 2);
    const rotY = Math.atan2(-(b.z - a.z), b.x - a.x);
    place("wall", geo, mid, rotY, { length: len, height: dims.height, thickness: dims.thickness });
  }
  function addColumn(p: THREE.Vector3) {
    const geo = new THREE.BoxGeometry(dims.colW, dims.height, dims.colD);
    place("column", geo, p.clone().setY(dims.height / 2), 0, { width: dims.colW, depth: dims.colD, height: dims.height });
  }
  function addSlab(a: THREE.Vector3, b: THREE.Vector3) {
    const dx = Math.abs(b.x - a.x), dz = Math.abs(b.z - a.z);
    if (dx < 1e-3 || dz < 1e-3) return;
    const geo = new THREE.BoxGeometry(dx, dims.slab, dz);
    const pos = new THREE.Vector3((a.x + b.x) / 2, dims.slab / 2, (a.z + b.z) / 2);
    place("slab", geo, pos, 0, { dx, dz, thickness: dims.slab });
  }

  // ── selection + gizmo ──
  function select(a: Authored) {
    deselect();
    selected = a;
    // Highlight via colour swap (MeshBasic has no emissive); restored on deselect.
    (a.mesh.material as THREE.MeshBasicMaterial).color.setHex(ACCENT);
    ensureGizmo();
    if (gizmo) { gizmo.attach(a.mesh); }
    refreshButtons();
    render();
  }
  function deselect() {
    if (selected) {
      (selected.mesh.material as THREE.MeshBasicMaterial).color.setHex(KIND_COLOR[selected.kind]);
    }
    selected = null;
    gizmo?.detach();
    refreshButtons();
    render();
  }
  function deleteSelected() {
    if (!selected) return;
    const a = selected;
    deselect();
    group.remove(a.mesh);
    a.mesh.geometry.dispose();
    (a.mesh.material as THREE.Material).dispose();
    const i = authored.indexOf(a);
    if (i >= 0) authored.splice(i, 1);
    saveToStore();
    render();
    status(`Deleted. ${authored.length} element(s).`);
  }
  function syncSelectedParams() {
    if (!selected) return;
    const p = selected.mesh.position;
    selected.params = { ...selected.params, x: p.x, y: p.y, z: p.z, rotY: selected.mesh.rotation.y };
  }

  // ── measure (cylinder mesh, visible in the deferred pipeline) ──
  function addMeasure(a: THREE.Vector3, b: THREE.Vector3) {
    const dist = a.distanceTo(b);
    const objs: THREE.Object3D[] = [];
    const mkDot = (p: THREE.Vector3) => {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), track(new THREE.MeshBasicMaterial({ color: ACCENT })));
      d.position.copy(p);
      d.userData.sentinelHelper = true;
      group.add(d); objs.push(d);
    };
    mkDot(a); mkDot(b);
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, dist, 8),
      track(new THREE.MeshBasicMaterial({ color: ACCENT })),
    );
    cyl.position.copy(a.clone().add(b).multiplyScalar(0.5));
    cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    cyl.userData.sentinelHelper = true;
    group.add(cyl); objs.push(cyl);
    measures.push({ id: uid("meas"), dist, objs });
    render();
    renderNotesList();
    status(`Distance: ${dist.toFixed(2)} m`);
  }

  // ── markup notes ──
  function addNote(p: THREE.Vector3) {
    const text = window.prompt("Note text:")?.trim();
    if (!text) return;
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14), track(new THREE.MeshBasicMaterial({ color: 0xffb020 })));
    pin.position.copy(p);
    pin.userData.sentinelHelper = true;
    group.add(pin);
    notes.push({ id: uid("note"), text, pos: [p.x, p.y, p.z], pin });
    saveToStore();
    render();
    renderNotesList();
    status(`Note added (${notes.length}).`);
  }
  function focusOn(pos: [number, number, number]) {
    const ctl = controls();
    if (!ctl?.setLookAt) return;
    const [x, y, z] = pos;
    ctl.setLookAt(x + 6, y + 5, z + 6, x, y, z, true);
  }
  function renderNotesList() {
    notesList.innerHTML = "";
    for (const m of measures) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:.4rem;font-size:11px;color:#c9cfda";
      row.innerHTML = `<span style="color:#a78bfa">↔</span> ${m.dist.toFixed(2)} m`;
      notesList.appendChild(row);
    }
    for (const n of notes) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:.4rem;font-size:11px;color:#e5e7eb";
      const focus = document.createElement("button");
      focus.textContent = "◎";
      focus.title = "Focus camera";
      focus.style.cssText = "border:0;background:transparent;color:#a78bfa;cursor:pointer;font-size:13px";
      focus.addEventListener("click", () => focusOn(n.pos));
      const del = document.createElement("button");
      del.textContent = "✕";
      del.style.cssText = "border:0;background:transparent;color:#f87171;cursor:pointer;margin-left:auto";
      del.addEventListener("click", () => removeNote(n));
      const label = document.createElement("span");
      label.textContent = `📌 ${n.text}`;
      row.append(focus, label, del);
      notesList.appendChild(row);
    }
  }
  function removeNote(n: Note) {
    group.remove(n.pin);
    n.pin.geometry.dispose();
    (n.pin.material as THREE.Material).dispose();
    const i = notes.indexOf(n);
    if (i >= 0) notes.splice(i, 1);
    saveToStore();
    render();
    renderNotesList();
  }

  // ── persistence (authored + notes; measures are transient) ──
  function saveToStore() {
    try {
      const data = {
        authored: authored.map((a) => ({
          kind: a.kind,
          params: a.params,
          pos: a.mesh.position.toArray(),
          rotY: a.mesh.rotation.y,
          scale: a.mesh.scale.toArray(),
        })),
        notes: notes.map((n) => ({ text: n.text, pos: n.pos })),
      };
      localStorage.setItem(storeKey(), JSON.stringify(data));
    } catch { /* storage disabled / quota — non-fatal */ }
  }
  function loadFromStore() {
    let data: {
      authored?: { kind: Kind; params: Record<string, number>; pos: number[]; rotY: number; scale?: number[] }[];
      notes?: { text: string; pos: [number, number, number] }[];
    };
    try {
      const raw = localStorage.getItem(storeKey());
      if (!raw) return;
      data = JSON.parse(raw);
    } catch { return; }

    for (const a of data.authored ?? []) {
      const geo = geoFor(a.kind, a.params);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mat(a.kind));
      mesh.position.fromArray(a.pos);
      mesh.rotation.y = a.rotY;
      if (a.scale) mesh.scale.fromArray(a.scale);
      mesh.userData.sentinel = true;
      group.add(mesh);
      authored.push({ id: uid(a.kind), kind: a.kind, mesh, params: a.params });
    }
    for (const n of data.notes ?? []) {
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14), track(new THREE.MeshBasicMaterial({ color: 0xffb020 })));
      pin.position.fromArray(n.pos);
      pin.userData.sentinelHelper = true;
      group.add(pin);
      notes.push({ id: uid("note"), text: n.text, pos: n.pos, pin });
    }
    if (authored.length || notes.length) {
      renderNotesList();
      render();
      status(`Restored ${authored.length} element(s), ${notes.length} note(s).`);
    }
  }
  function geoFor(kind: Kind, p: Record<string, number>): THREE.BufferGeometry | null {
    if (kind === "wall") return new THREE.BoxGeometry(p.length ?? 1, p.height ?? 3, p.thickness ?? 0.2);
    if (kind === "column") return new THREE.BoxGeometry(p.width ?? 0.4, p.height ?? 3, p.depth ?? 0.4);
    if (kind === "slab") return new THREE.BoxGeometry(p.dx ?? 2, p.thickness ?? 0.3, p.dz ?? 2);
    return null;
  }

  // ── bake authored meshes → real IFC4 (via sentinel-core/ifc-writer) and download ──
  function bakeDescriptors(): BakeElement[] {
    return authored.map((a) => {
      // Effective box dims = geometry params × gizmo scale (captures any resize the user did).
      const p = (a.mesh.geometry as THREE.BoxGeometry).parameters ?? { width: 1, height: 1, depth: 1 };
      const sc = a.mesh.scale;
      return {
        kind: a.kind,
        size: { x: (p.width ?? 1) * sc.x, y: (p.height ?? 1) * sc.y, z: (p.depth ?? 1) * sc.z },
        position: [a.mesh.position.x, a.mesh.position.y, a.mesh.position.z],
        rotationY: a.mesh.rotation.y,
        typeName: `Sentinel ${a.kind}`,
      };
    });
  }
  function bakeToIfc() {
    if (!ensure()) { status("Viewer not ready yet."); return; }
    if (!authored.length) { status("Author some elements first, then bake."); return; }
    try {
      const ts = Math.floor(Date.now() / 1000);
      const ifc = buildIfc(bakeDescriptors(), { projectName: `Sentinel ${projectId()}`, timestamp: ts });
      const blob = new Blob([ifc], { type: "application/x-step" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sentinel-model-${ts}.ifc`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      status(`Baked ${authored.length} element(s) → IFC downloaded. Load it via Assets to see it as a real model.`);
    } catch (e) {
      status(`Bake failed: ${(e as Error)?.message ?? String(e)}`);
    }
  }
  function nextVersion(): number {
    let n = 1;
    try { n = (parseInt(localStorage.getItem(verKey()) || "0", 10) || 0) + 1; localStorage.setItem(verKey(), String(n)); } catch { /* storage off */ }
    return n;
  }
  async function bakeUpload() {
    if (!ensure()) { status("Viewer not ready yet."); return; }
    if (!authored.length) { status("Author some elements first, then upload."); return; }
    const n = nextVersion();
    uploadBtn.disabled = true;
    status(`Baking + uploading ${authored.length} element(s) to the platform (v${n})…`);
    try {
      const ifc = buildIfc(bakeDescriptors(), { projectName: `Sentinel ${projectId()}`, timestamp: Math.floor(Date.now() / 1000) });
      const url =
        `${base}/ifc?name=${encodeURIComponent("sentinel-model.ifc")}` +
        `&version=v${n}&projectId=${encodeURIComponent(projectId())}`;
      const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-step" }, body: ifc });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        status(
          resp.status === 503
            ? `Bridge reachable but not configured: ${j.message}. Set THATOPEN_API_KEY + THATOPEN_PROJECT_ID in config/.env and restart start.ps1.`
            : `Upload failed (${resp.status}): ${j.message || "see the bridge console"}.`,
        );
        return;
      }
      status(`Uploaded to platform ✓ item ${j.itemId ?? "?"} (v${n}, ${j.format}, ${j.bytes ?? "?"} bytes). Open the model list to view it.`);
      // Register the upload in the CDE file-version history (migration 0011) so it joins the Versions panel
      // timeline alongside web-panel uploads + Revit publishes. Best-effort; a CDE-less bridge just 503-noops.
      try {
        await bfetch(`${base}/cde/${encodeURIComponent(projectId())}/files`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "sentinel-model.ifc", author: "web", size_bytes: j.bytes ?? null, platform_item_id: j.itemId ?? null, notes: "baked + uploaded via web modeler" }),
        });
      } catch { /* versioning is best-effort — the upload already succeeded */ }
    } catch (e) {
      status(`Upload failed: ${(e as Error)?.message ?? String(e)}. Is the bridge running? Start it with start.ps1 (or npm run bcf:serve).`);
    } finally {
      uploadBtn.disabled = false;
    }
  }

  // Frame the camera on everything authored (camera-controls fitToBox; falls back to setLookAt).
  function frameAuthored() {
    if (!ensure() || !authored.length) { status("Nothing to frame yet — place an element first."); return; }
    const box = new THREE.Box3();
    for (const a of authored) box.expandByObject(a.mesh);
    if (box.isEmpty()) return;
    const ctl = controls();
    try {
      if (ctl?.fitToBox) {
        ctl.fitToBox(box, true, { paddingLeft: 1, paddingRight: 1, paddingTop: 1, paddingBottom: 1 });
      } else if (ctl?.setLookAt) {
        const c = box.getCenter(new THREE.Vector3());
        const s = box.getSize(new THREE.Vector3()).length() || 5;
        ctl.setLookAt(c.x + s, c.y + s * 0.8, c.z + s, c.x, c.y, c.z, true);
      }
      render();
      status(`Framed ${authored.length} element(s).`);
    } catch (e) { status(`Fit failed: ${(e as Error).message}`); }
  }
  (root.querySelector("#md-fit") as HTMLButtonElement).addEventListener("click", frameAuthored);

  // ── clear everything (two-click confirm — window.confirm is blocked in the platform iframe) ──
  const clearBtn = root.querySelector("#md-clear") as HTMLButtonElement;
  let clearArmed = false;
  clearBtn.addEventListener("click", () => {
    if (!authored.length && !notes.length && !measures.length) { status("Nothing to clear."); return; }
    if (!clearArmed) {
      clearArmed = true;
      clearBtn.textContent = "Clear? ✓";
      clearBtn.style.borderColor = "#ef4444";
      status("Click “Clear? ✓” again to remove everything.");
      window.setTimeout(() => { clearArmed = false; clearBtn.textContent = "Clear"; clearBtn.style.borderColor = "#2c2c34"; }, 3000);
      return;
    }
    clearArmed = false;
    clearBtn.textContent = "Clear";
    clearBtn.style.borderColor = "#2c2c34";
    deselect();
    for (const a of [...authored]) { group.remove(a.mesh); a.mesh.geometry.dispose(); (a.mesh.material as THREE.Material).dispose(); }
    for (const n of [...notes]) { group.remove(n.pin); n.pin.geometry.dispose(); (n.pin.material as THREE.Material).dispose(); }
    for (const m of measures) for (const o of m.objs) { group.remove(o); (o as THREE.Mesh).geometry?.dispose?.(); ((o as THREE.Mesh).material as THREE.Material)?.dispose?.(); }
    authored.length = 0; notes.length = 0; measures.length = 0;
    saveToStore();
    renderNotesList();
    render();
    status("Cleared.");
  });

  // Wire on first paint (world already exists when the tab opens). Retry a few frames if not.
  let tries = 0;
  const tick = () => { if (ensure() || tries++ > 120) { refreshButtons(); return; } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);

  return root;
}
