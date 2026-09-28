// sentinel-core/perf-stats — PURE (no OBC/THREE/DOM). Turns one measuring window of the viewer (frame gaps from
// requestAnimationFrame, the draw calls and triangles each rendered frame submitted, what the models and the browser
// report) into the lines the Performance tab prints. Spec 2026-09-28-3d-viewer-design.md Decision 5: measure the
// founder's own models before changing how they load. Nothing here judges a number; the facts are said as facts, and
// what the browser does not report is said as "not reported", never as zero.

/** What one rendered frame submitted to the GPU (every render call of that frame summed: postproduction draws the
 *  scene in several passes, so this is submitted work, not the model's triangle count). */
export interface FrameWork { calls: number; triangles: number; }

export interface PerfWindow {
  durationMs: number;
  frameGapsMs: number[];     // gaps between consecutive animation frames while measuring
  rendered: FrameWork[];     // one entry per frame in which the renderer drew at least once
}

export interface PerfModel {
  modelId: string;
  items: number | null;           // elements with geometry; null = the model did not answer
  cameraBound: boolean | null;    // true = culling and LOD follow a camera; null = not reported
}

export interface PerfSnapshot {
  api: string;                     // "webgl" | "webgpu" | what the renderer says
  rendererClass: string;           // e.g. PostproductionRenderer
  mode: string;                    // "AUTO (draws every frame)" | "MANUAL (draws on change)" | "not reported"
  gpu: string | null;              // adapter/renderer string, null = hidden by the browser
  window: PerfWindow;
  heap: { usedMB: number; limitMB: number } | null;
  gpuMemory: { geometries: number; textures: number } | null;
  models: PerfModel[];
  settings: Record<string, string | number | boolean>;
}

/** Nearest-rank percentile of `xs` (0-100); NaN for an empty list. */
export function percentile(xs: readonly number[], p: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const rank = Math.min(s.length, Math.max(1, Math.ceil((p / 100) * s.length)));
  return s[rank - 1];
}

const ms = (x: number) => (Number.isFinite(x) ? `${x.toFixed(1)} ms` : "—");
const int = (x: number) => Math.round(x).toLocaleString("en-US");

/** The readout, one fact per line. */
export function perfLines(s: PerfSnapshot): string[] {
  const w = s.window;
  const secs = w.durationMs / 1000;
  const fps = secs > 0 ? w.frameGapsMs.length / secs : NaN;
  const renders = secs > 0 ? w.rendered.length / secs : NaN;
  const calls = w.rendered.map((f) => f.calls);
  const tris = w.rendered.map((f) => f.triangles);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const lines = [
    `Renderer: ${s.api} · ${s.rendererClass} · ${s.mode}`,
    `GPU: ${s.gpu ?? "not reported by the browser"}`,
    `Measured ${secs.toFixed(1)} s · ${w.frameGapsMs.length} frames (${Number.isFinite(fps) ? fps.toFixed(0) : "—"} per s) · frame time p50 ${ms(percentile(w.frameGapsMs, 50))}, p95 ${ms(percentile(w.frameGapsMs, 95))}, worst ${ms(w.frameGapsMs.length ? Math.max(...w.frameGapsMs) : NaN)}`,
    w.rendered.length
      ? `Drawn ${w.rendered.length} frame(s) (${renders.toFixed(0)} per s) · per drawn frame: draw calls avg ${int(avg(calls))} / max ${int(Math.max(...calls))} · triangles submitted avg ${int(avg(tris))} / max ${int(Math.max(...tris))}`
      : "Drawn 0 frames — the renderer did not draw while measuring (it draws on change: orbit the model while measuring)",
    s.gpuMemory ? `GPU memory: ${int(s.gpuMemory.geometries)} geometries · ${int(s.gpuMemory.textures)} textures` : "GPU memory: not reported by this renderer",
    s.heap ? `JS heap: ${s.heap.usedMB.toFixed(0)} MB used of ${s.heap.limitMB.toFixed(0)} MB` : "JS heap: not reported by this browser",
  ];
  const items = s.models.reduce((a, m) => a + (m.items ?? 0), 0);
  const unknownItems = s.models.filter((m) => m.items == null).length;
  lines.push(`Models: ${s.models.length} · ${int(items)} element(s) with geometry${unknownItems ? ` (${unknownItems} model(s) did not answer)` : ""}`);
  for (const m of s.models)
    lines.push(`  ${m.modelId}: ${m.items == null ? "items not reported" : `${int(m.items)} element(s)`} · culling/LOD ${m.cameraBound == null ? "camera not reported" : m.cameraBound ? "follow the camera" : "NOT bound to a camera"}`);
  const set = Object.entries(s.settings);
  if (set.length) lines.push(`Engine settings: ${set.map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  return lines;
}

/** The one fact the streaming decision hangs on, said plainly (null when every model reports a bound camera). */
export function cameraFinding(models: readonly PerfModel[]): string | null {
  const unbound = models.filter((m) => m.cameraBound === false).length;
  const unknown = models.filter((m) => m.cameraBound == null).length;
  if (!models.length) return null;
  if (unbound) return `${unbound} of ${models.length} model(s) are not bound to the viewer's camera: every element is kept on the GPU whatever the camera sees — binding the camera at load is the first streaming step.`;
  if (unknown) return `${unknown} of ${models.length} model(s) did not report a camera.`;
  return null;
}
