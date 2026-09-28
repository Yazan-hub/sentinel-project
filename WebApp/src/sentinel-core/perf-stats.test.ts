import { describe, it, expect } from "vitest";
import { percentile, perfLines, cameraFinding, type PerfSnapshot } from "./perf-stats";

const snap = (over: Partial<PerfSnapshot> = {}): PerfSnapshot => ({
  api: "webgl", rendererClass: "PostproductionRenderer", mode: "AUTO (draws every frame)", gpu: "ANGLE (NVIDIA)",
  window: { durationMs: 2000, frameGapsMs: [16, 16, 17, 16, 33, 16], rendered: [{ calls: 120, triangles: 900000 }, { calls: 80, triangles: 300000 }] },
  heap: { usedMB: 212.4, limitMB: 4096 }, gpuMemory: { geometries: 1400, textures: 12 },
  models: [{ modelId: "ARC@v4", items: 602, cameraBound: true }, { modelId: "STR@v2", items: 1200, cameraBound: false }],
  settings: { graphicsQuality: 0, maxUpdateRate: 100 },
  ...over,
});

describe("percentile", () => {
  it("is nearest-rank and NaN on nothing", () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([16, 16, 17, 16, 33, 16], 95)).toBe(33);
    expect(percentile([7], 0)).toBe(7);
    expect(Number.isNaN(percentile([], 50))).toBe(true);
  });
});

describe("perfLines", () => {
  it("says each measured fact once, with the drawn-frame work summed per frame", () => {
    expect(perfLines(snap())).toEqual([
      "Renderer: webgl · PostproductionRenderer · AUTO (draws every frame)",
      "GPU: ANGLE (NVIDIA)",
      "Measured 2.0 s · 6 frames (3 per s) · frame time p50 16.0 ms, p95 33.0 ms, worst 33.0 ms",
      "Drawn 2 frame(s) (1 per s) · per drawn frame: draw calls avg 100 / max 120 · triangles submitted avg 600,000 / max 900,000",
      "GPU memory: 1,400 geometries · 12 textures",
      "JS heap: 212 MB used of 4096 MB",
      "Models: 2 · 1,802 element(s) with geometry",
      "  ARC@v4: 602 element(s) · culling/LOD follow the camera",
      "  STR@v2: 1,200 element(s) · culling/LOD NOT bound to a camera",
      "Engine settings: graphicsQuality 0 · maxUpdateRate 100",
    ]);
  });
  it("what the browser hides is 'not reported', never zero; no drawn frame is explained", () => {
    const lines = perfLines(snap({ gpu: null, heap: null, gpuMemory: null, window: { durationMs: 1000, frameGapsMs: [], rendered: [] },
      models: [{ modelId: "A", items: null, cameraBound: null }], settings: {} }));
    expect(lines).toContain("GPU: not reported by the browser");
    expect(lines).toContain("JS heap: not reported by this browser");
    expect(lines).toContain("GPU memory: not reported by this renderer");
    expect(lines).toContain("Drawn 0 frames — the renderer did not draw while measuring (it draws on change: orbit the model while measuring)");
    expect(lines).toContain("Measured 1.0 s · 0 frames (0 per s) · frame time p50 —, p95 —, worst —");
    expect(lines).toContain("Models: 1 · 0 element(s) with geometry (1 model(s) did not answer)");
    expect(lines).toContain("  A: items not reported · culling/LOD camera not reported");
    expect(lines.some((l) => l.startsWith("Engine settings"))).toBe(false);
  });
});

describe("cameraFinding", () => {
  it("names the unbound models as the first streaming step", () => {
    expect(cameraFinding(snap().models)).toBe("1 of 2 model(s) are not bound to the viewer's camera: every element is kept on the GPU whatever the camera sees — binding the camera at load is the first streaming step.");
  });
  it("says nothing when every model follows the camera, and says so when a model did not report", () => {
    expect(cameraFinding([{ modelId: "A", items: 1, cameraBound: true }])).toBeNull();
    expect(cameraFinding([{ modelId: "A", items: 1, cameraBound: null }])).toBe("1 of 1 model(s) did not report a camera.");
    expect(cameraFinding([])).toBeNull();
  });
});
