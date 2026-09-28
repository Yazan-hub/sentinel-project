import * as OBC from "@thatopen/components";
import { perfLines, cameraFinding, type FrameWork, type PerfModel, type PerfSnapshot } from "../sentinel-core/perf-stats";

/**
 * BIM Tools ▸ Performance (spec 2026-09-28-3d-viewer-design.md Decision 5): measure the viewer on the models that are
 * loaded, for a few seconds while the person orbits, before anything about loading or rendering changes.
 *
 * Measuring touches nothing outside its window: for the duration only, the renderer's own `render` is wrapped to sum the
 * draw calls and triangles of every pass of a frame (postproduction draws the scene several times; Sentinel's clipper
 * and measure tools also call update() between frames), and requestAnimationFrame timestamps give the frame time. The
 * wrapper is removed when the window ends, even when measuring fails. It never sets needsUpdate or calls update(): a
 * renderer that draws only on change shows "drawn 0 frames" instead of being made to draw.
 */
export function perfPanel(components: OBC.Components): HTMLElement {
  const fragments = components.get(OBC.FragmentsManager);
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  const btn = "border:1px solid #2c2c34;background:#22303a;color:#bfe3f2;border-radius:.35rem;padding:.35rem .6rem;font:600 12px system-ui;cursor:pointer";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
    '<span style="font-weight:600">⏱ Performance</span><span style="color:#9ca3af;font-size:11px">the viewer, measured</span>' +
    '<span style="flex:1"></span>' +
    `<button id="pf-run" style="${btn}" title="Measure for 10 seconds — orbit and zoom the model meanwhile">Measure 10 s</button>` +
    "</div>" +
    '<div id="pf-find" style="display:none;padding:.5rem .6rem;border-bottom:1px solid #2a2a30;color:#fcd34d;font-size:12px;line-height:1.45"></div>' +
    '<pre id="pf-out" style="flex:1;margin:0;overflow:auto;padding:.6rem;font:11px/1.55 ui-monospace,Consolas,monospace;color:#d4d4d8;white-space:pre-wrap;user-select:text">Load a model, press Measure, and orbit the model for the 10 seconds.</pre>' +
    '<div id="pf-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">…</div>';
  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const status = (t: string) => (el("pf-status").textContent = t);
  status("Nothing is measured until you press Measure.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstWorld = (): any => [...components.get(OBC.Worlds).list.values()][0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function gpuString(three: any): string | null {
    try {
      const gl = three?.getContext?.();
      const ext = gl?.getExtension?.("WEBGL_debug_renderer_info");
      const s = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter?.(gl.RENDERER);
      return typeof s === "string" && s.length ? s : null;
    } catch { return null; }
  }

  function heap(): PerfSnapshot["heap"] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = (performance as any).memory;
    return m && typeof m.usedJSHeapSize === "number" ? { usedMB: m.usedJSHeapSize / 1048576, limitMB: m.jsHeapSizeLimit / 1048576 } : null;
  }

  // The engine's load/culling settings, flattened one level (culling.enabled, lodThresholds.…), primitives only.
  function settings(): Record<string, string | number | boolean> {
    const out: Record<string, string | number | boolean> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (fragments as any).core?.settings;
    if (!s || typeof s !== "object") return out;
    const put = (k: string, v: unknown) => { if (["string", "number", "boolean"].includes(typeof v)) out[k] = v as string | number | boolean; };
    for (const [k, v] of Object.entries(s)) {
      if (v && typeof v === "object" && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v)) put(`${k}.${k2}`, v2);
      else put(k, v);
    }
    return out;
  }

  async function models(): Promise<PerfModel[]> {
    const out: PerfModel[] = [];
    for (const [id, model] of fragments.list) {
      let items: number | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { items = (await (model as any).getItemsIdsWithGeometry()).length; } catch { items = null; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cam = "camera" in (model as any) ? (model as any).camera : undefined;
      out.push({ modelId: String(id), items, cameraBound: cam === undefined ? null : cam != null });
    }
    return out;
  }

  let running = false;
  async function measure(seconds: number) {
    if (running) return;
    const world = firstWorld();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderer: any = world?.renderer;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const three: any = renderer?.three;
    if (!three) { status("No viewer to measure — open the 3D view first."); return; }
    running = true;
    const run = el("pf-run") as HTMLButtonElement;
    run.disabled = true;

    const api = String(renderer.api ?? (three.isWebGPURenderer ? "webgpu" : "webgl"));
    const info = three.info;
    const frameGapsMs: number[] = [];
    const rendered: FrameWork[] = [];
    let cur: FrameWork = { calls: 0, triangles: 0 };
    let drewThisFrame = false;

    // Sum every render() of a frame. With autoReset (three's default) info holds the last call alone; without it,
    // the call's share is the difference. WebGPU's per-frame count is drawCalls (its `calls` is a running total).
    const original = three.render;
    const hadOwn = Object.prototype.hasOwnProperty.call(three, "render");
    const readCalls = () => Number(info?.render?.drawCalls ?? info?.render?.calls ?? 0);
    const readTris = () => Number(info?.render?.triangles ?? 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    three.render = function (...args: any[]) {
      const auto = info?.autoReset !== false;
      const c0 = readCalls(), t0 = readTris();
      const r = original.apply(this, args);
      cur.calls += auto ? readCalls() : readCalls() - c0;
      cur.triangles += auto ? readTris() : readTris() - t0;
      drewThisFrame = true;
      return r;
    };

    const t0 = performance.now();
    let last = t0;
    try {
      await new Promise<void>((resolve) => {
        const tick = (now: number) => {
          frameGapsMs.push(now - last);
          last = now;
          if (drewThisFrame) { rendered.push(cur); cur = { calls: 0, triangles: 0 }; drewThisFrame = false; }
          const left = seconds * 1000 - (now - t0);
          status(left > 0 ? `Measuring… ${Math.ceil(left / 1000)} s left — orbit and zoom the model.` : "Reading the models…");
          if (now - t0 < seconds * 1000) requestAnimationFrame(tick); else resolve();
        };
        requestAnimationFrame((now) => { last = now; requestAnimationFrame(tick); });
      });
    } finally {
      if (hadOwn) three.render = original; else delete three.render; // the renderer is left exactly as it was
    }
    const durationMs = performance.now() - t0;

    const mode = renderer.mode === 0 ? "MANUAL (draws on change)" : renderer.mode === 1 ? "AUTO (draws every frame)" : "mode not reported";
    const mem = info?.memory;
    const snap: PerfSnapshot = {
      api, rendererClass: renderer.constructor?.name || "renderer", mode, gpu: gpuString(three),
      window: { durationMs, frameGapsMs, rendered },
      heap: heap(),
      gpuMemory: mem && typeof mem.geometries === "number" ? { geometries: mem.geometries, textures: Number(mem.textures ?? 0) } : null,
      models: await models(),
      settings: settings(),
    };
    const lines = perfLines(snap);
    el("pf-out").textContent = [`Measured ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`, ...lines].join("\n");
    const finding = cameraFinding(snap.models);
    el("pf-find").style.display = finding ? "block" : "none";
    el("pf-find").textContent = finding ?? "";
    // eslint-disable-next-line no-console
    console.log("[Sentinel] performance\n" + lines.join("\n"));
    status("Done — select the text to copy it.");
    run.disabled = false;
    running = false;
  }

  el("pf-run").addEventListener("click", () => {
    measure(10).catch((e) => {
      status("Measure failed: " + ((e as Error)?.message ?? String(e)));
      (el("pf-run") as HTMLButtonElement).disabled = false;
      running = false;
    });
  });
  return root;
}
