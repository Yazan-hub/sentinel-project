// MA-7-11 - the splat viewer's pure parts: the one-gaussian probe file, and the probe's three answers (starts, never starts, refuses). Spark itself needs a GPU
// and a worker, so it is exercised live (drill rows SP-0 and SP-2), never here.
import { describe, it, expect, vi, afterEach } from "vitest";
import { tinySplatPly, probeSparkWith, LOCAL_ONLY_WORDS, SPLAT_PROBE_MS } from "./splat-view";

afterEach(() => vi.useRealTimers());

describe("tinySplatPly", () => {
  const header = (b: Uint8Array) => { const t = new TextDecoder("latin1").decode(b), end = t.indexOf("end_header\n") + "end_header\n".length; return { text: t.slice(0, end), end }; };
  it("is a binary little-endian 3DGS .ply with exactly n gaussians of 14 floats", () => {
    for (const n of [1, 1000]) {
      const b = tinySplatPly(n), { text, end } = header(b);
      expect(text.startsWith("ply\nformat binary_little_endian 1.0\n")).toBe(true);
      expect(text).toContain(`element vertex ${n}\n`);
      for (const p of ["x", "y", "z", "f_dc_0", "opacity", "scale_0", "scale_2", "rot_0", "rot_3"]) expect(text).toContain(`property float ${p}\n`);
      expect(b.length - end).toBe(n * 14 * 4);
    }
  });
  it("carries a unit rotation and a finite, visible gaussian (so Spark can draw it)", () => {
    const b = tinySplatPly(2), { end } = header(b), dv = new DataView(b.buffer, b.byteOffset);
    const f = (g: number, k: number) => dv.getFloat32(end + (g * 14 + k) * 4, true);
    for (let g = 0; g < 2; g++) { expect([f(g, 10), f(g, 11), f(g, 12), f(g, 13)]).toEqual([1, 0, 0, 0]); for (let k = 0; k < 14; k++) expect(Number.isFinite(f(g, k))).toBe(true); }
    expect(f(1, 0)).toBeCloseTo(0.01, 6); // the second gaussian is a step along x
  });
  it("passes the bridge's header check: opacity, scale_0 and rot_0 are named", async () => {
    // @ts-expect-error - a plain .mjs with no declaration file (verify-jwt.test.ts imports the bridge the same way)
    const { splatHeaderRefusal } = await import("../../bridge/evidence-logic.mjs");
    expect(splatHeaderRefusal(Buffer.from(tinySplatPly(3)).subarray(0, 4096))).toBe(null);
  });
});

describe("probeSparkWith (amendment 32)", () => {
  it("ok when Spark's worker starts: a SplatMesh of the one-gaussian file initialises, and the probe is thrown away", async () => {
    const dispose = vi.fn(), seen: Uint8Array[] = [];
    class Mesh { initialized = Promise.resolve(this); dispose = dispose; constructor(o: { fileBytes: Uint8Array }) { seen.push(o.fileBytes); } }
    expect(await probeSparkWith(async () => ({ SplatMesh: Mesh }))).toEqual({ ok: true });
    expect(seen).toHaveLength(1);
    expect(seen[0].length).toBe(tinySplatPly(1).length);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
  it("not ok, in the local-app words, when the worker never starts within the bound (the published view)", async () => {
    vi.useFakeTimers();
    class Hang { initialized = new Promise<never>(() => {}); }
    const p = probeSparkWith(async () => ({ SplatMesh: Hang }), SPLAT_PROBE_MS, true);
    await vi.advanceTimersByTimeAsync(SPLAT_PROBE_MS + 1);
    expect(await p).toEqual({ ok: false, why: "splats show in the local app on this PC (this published view cannot start Spark's worker) — nothing was loaded" });
    expect(LOCAL_ONLY_WORDS).toBe("splats show in the local app on this PC (this published view cannot start Spark's worker) — nothing was loaded");
  });
  it("not ok when Spark cannot be loaded or its mesh refuses", async () => {
    expect(await probeSparkWith(async () => { throw new Error("blocked"); }, SPLAT_PROBE_MS, true)).toEqual({ ok: false, why: LOCAL_ONLY_WORDS });
    class Bad { initialized = Promise.reject(new Error("worker blocked")); }
    expect(await probeSparkWith(async () => ({ SplatMesh: Bad }), SPLAT_PROBE_MS, true)).toEqual({ ok: false, why: LOCAL_ONLY_WORDS });
  });
  it("MA-7-11 review: in the local app a failure says try again with the cause, not local-app-only; the bound starts after the chunk loads", async () => {
    vi.useFakeTimers();
    const r = await probeSparkWith(async () => { throw new Error("blocked"); }, SPLAT_PROBE_MS, false);
    expect(r).toEqual({ ok: false, why: "Spark did not start within 5 s (blocked) — nothing was loaded; try again" });
    // a slow download (10 s) does not count against the 5 s worker bound
    class Quick { initialized = Promise.resolve(); }
    const p = probeSparkWith(() => new Promise((res) => setTimeout(() => res({ SplatMesh: Quick }), 10000)), SPLAT_PROBE_MS, false);
    await vi.advanceTimersByTimeAsync(10001);
    expect(await p).toEqual({ ok: true });
    vi.useRealTimers();
  });
});
