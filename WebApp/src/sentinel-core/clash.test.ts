import { describe, it, expect } from "vitest";
import { boxesClash, findClashes, clashSignature, dedupeClashes, computeClashRun, type Aabb, type ClashItem } from "./clash";

const box = (min: [number, number, number], max: [number, number, number]): Aabb => ({ min, max });
const item = (id: number, b: Aabb): ClashItem => ({ modelId: "m", localId: id, box: b });
const mItem = (modelId: string, id: number, b: Aabb): ClashItem => ({ modelId, localId: id, box: b });

describe("boxesClash", () => {
  it("detects a real overlap", () => {
    expect(boxesClash(box([0, 0, 0], [2, 2, 2]), box([1, 1, 1], [3, 3, 3]), 0.02)).not.toBeNull();
  });
  it("rejects boxes that merely touch at a corner (within tolerance)", () => {
    expect(boxesClash(box([0, 0, 0], [1, 1, 1]), box([1, 1, 1], [2, 2, 2]), 0.02)).toBeNull();
  });
  it("rejects clearly separated boxes", () => {
    expect(boxesClash(box([0, 0, 0], [1, 1, 1]), box([5, 5, 5], [6, 6, 6]), 0.02)).toBeNull();
  });
});

describe("findClashes (sweep-and-prune)", () => {
  it("finds an overlapping pair and skips a separated one", () => {
    const a = [item(1, box([0, 0, 0], [2, 2, 2]))];
    const b = [item(2, box([1, 1, 1], [3, 3, 3])), item(3, box([10, 10, 10], [11, 11, 11]))];
    const clashes = findClashes(a, b);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].a.localId).toBe(1);
    expect(clashes[0].b.localId).toBe(2);
    expect(clashes[0].volume).toBeGreaterThan(0);
  });
  it("honours the result cap", () => {
    // 3 a-boxes each overlapping 3 b-boxes = 9 potential clashes; cap at 4.
    const a = [0, 1, 2].map((i) => item(i, box([i, 0, 0], [i + 2, 3, 3])));
    const b = [0, 1, 2].map((i) => item(10 + i, box([i, 0, 0], [i + 2, 3, 3])));
    expect(findClashes(a, b, 0.02, 4).length).toBeLessThanOrEqual(4);
  });
});

describe("clashSignature", () => {
  it("is order-independent (stable dedup key across runs)", () => {
    const x = item(1, box([0, 0, 0], [1, 1, 1]));
    const y = item(2, box([0, 0, 0], [1, 1, 1]));
    expect(clashSignature(x, y)).toBe(clashSignature(y, x));
  });

  // Regression: signatures must survive a model re-export so a resolved/approved clash stays resolved.
  it("keys on GlobalId → identical across a re-export (modelId + localId both change)", () => {
    const a1: ClashItem = { modelId: "arch_v1", localId: 5, guid: "GUID-A", box: box([0, 0, 0], [1, 1, 1]) };
    const b1: ClashItem = { modelId: "struct_v1", localId: 9, guid: "GUID-B", box: box([0, 0, 0], [1, 1, 1]) };
    // Same two elements, re-exported: fragments modelId and IFC localId both shifted; GlobalIds did not.
    const a2: ClashItem = { modelId: "arch_v2", localId: 77, guid: "GUID-A", box: box([0, 0, 0], [1, 1, 1]) };
    const b2: ClashItem = { modelId: "struct_v2", localId: 42, guid: "GUID-B", box: box([0, 0, 0], [1, 1, 1]) };
    expect(clashSignature(a2, b2)).toBe(clashSignature(a1, b1));
    expect(clashSignature(a1, b1)).toBe(clashSignature(b1, a1)); // still order-independent
  });

  it("falls back to modelId:localId when a GlobalId is absent", () => {
    const x = item(1, box([0, 0, 0], [1, 1, 1])); // item() sets no guid
    const y = item(2, box([0, 0, 0], [1, 1, 1]));
    expect(clashSignature(x, y)).toBe(clashSignature(y, x));
    expect(clashSignature(x, y)).toContain("m:1");
  });
});

describe("dedupeClashes", () => {
  it("drops already-known clashes and within-run duplicates", () => {
    const a = [item(1, box([0, 0, 0], [2, 2, 2]))];
    const b = [item(2, box([1, 1, 1], [3, 3, 3]))];
    const clashes = findClashes(a, b);
    expect(dedupeClashes(clashes, new Set())).toHaveLength(1);
    expect(dedupeClashes(clashes, new Set([clashes[0].id]))).toHaveLength(0);
    expect(dedupeClashes([...clashes, ...clashes], new Set())).toHaveLength(1);
  });
});

describe("computeClashRun (the off-thread orchestration)", () => {
  it("federates 2+ sets pairwise (cross-model only) and ranks by penetration volume", () => {
    // arch wall clashes struct beam (big overlap) and struct column (small overlap); the two arch elements
    // don't clash each other (federated case never self-clashes a model).
    const arch = [mItem("arch", 1, box([0, 0, 0], [4, 4, 4])), mItem("arch", 2, box([20, 0, 0], [21, 1, 1]))];
    const struct = [mItem("struct", 10, box([1, 1, 1], [5, 5, 5])), mItem("struct", 11, box([3.9, 0, 0], [4.4, 0.5, 0.5]))];
    const { total, clashes } = computeClashRun([arch, struct]);
    expect(total).toBe(2);
    expect(clashes).toHaveLength(2);
    expect(clashes[0].volume).toBeGreaterThanOrEqual(clashes[1].volume); // volume-ranked
    expect(clashes.every((c) => c.a.modelId !== c.b.modelId)).toBe(true); // strictly cross-model
  });

  it("self-clashes a single set but never pairs an element with itself", () => {
    const one = [item(1, box([0, 0, 0], [2, 2, 2])), item(2, box([1, 1, 1], [3, 3, 3])), item(3, box([50, 50, 50], [51, 51, 51]))];
    const { clashes } = computeClashRun([one]);
    expect(clashes).toHaveLength(1); // 1↔2 overlap; 3 is far; no 1↔1/2↔2/3↔3
    expect(clashes[0].a.localId).not.toBe(clashes[0].b.localId);
  });

  it("excludes clashes already known from a prior run", () => {
    const arch = [mItem("arch", 1, box([0, 0, 0], [4, 4, 4]))];
    const struct = [mItem("struct", 10, box([1, 1, 1], [5, 5, 5]))];
    const first = computeClashRun([arch, struct]);
    expect(first.clashes).toHaveLength(1);
    const known = new Set([first.clashes[0].id]);
    const second = computeClashRun([arch, struct], known);
    expect(second.total).toBe(1); // raw compare still finds it
    expect(second.clashes).toHaveLength(0); // ...but it's filtered as already-known
  });

  it("returns nothing for an empty or single-element scene", () => {
    expect(computeClashRun([]).clashes).toHaveLength(0);
    expect(computeClashRun([[]]).clashes).toHaveLength(0);
    expect(computeClashRun([[item(1, box([0, 0, 0], [1, 1, 1]))]]).clashes).toHaveLength(0);
  });
});

describe("findClashes with long elements (large-model benchmark 2026-10-21)", () => {
  // The single-pointer sweep it replaced: the same pairs, but it stalled behind the first long element.
  const prefixSweep = (setA: ClashItem[], setB: ClashItem[], tol = 0.02, cap = 20000) => {
    const a = [...setA].sort((p, q) => p.box.min[0] - q.box.min[0]);
    const b = [...setB].sort((p, q) => p.box.min[0] - q.box.min[0]);
    const out: string[] = [];
    let start = 0;
    for (const ia of a) {
      while (start < b.length && b[start].box.max[0] <= ia.box.min[0] + tol) start++;
      for (let j = start; j < b.length; j++) {
        if (b[j].box.min[0] >= ia.box.max[0] - tol) break;
        if (boxesClash(ia.box, b[j].box, tol)) { out.push(clashSignature(ia, b[j])); if (out.length >= cap) return out; }
      }
    }
    return out;
  };
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // Mostly short elements along 100 m, one in twenty a long one (a slab, a main duct) across most of it.
  const scene = (modelId: string, n: number) => Array.from({ length: n }, (_, i) => {
    const x = rnd() * 100, y = rnd() * 10, z = rnd() * 10, long = rnd() < 0.05;
    return mItem(modelId, i, box([x, y, z], [x + (long ? 60 : rnd() * 3), y + rnd() * 3, z + rnd() * 3]));
  });
  const A = scene("A", 800), B = scene("B", 800);
  const ids = (cs: { id: string }[]) => cs.map((c) => c.id);

  it("finds exactly the pairs of the single-pointer sweep, in the same order, also when capped and against itself", () => {
    const want = prefixSweep(A, B);
    expect(want.length).toBeGreaterThan(1000);
    expect(ids(findClashes(A, B))).toEqual(want);
    expect(ids(findClashes(A, B, 0.02, 137))).toEqual(prefixSweep(A, B, 0.02, 137));
    expect(ids(findClashes(A, A))).toEqual(prefixSweep(A, A));
  });

  it("the worker's copy finds the same as clash.ts (the two are kept in lock-step by hand)", async () => {
    const { WORKER_SRC } = await import("./adapter/clash-worker");
    const blob = new Function("self", `${WORKER_SRC}; return { findClashes, computeClashRun };`)({}) as
      { findClashes: typeof findClashes; computeClashRun: (s: ClashItem[][], k: Set<string>, t: number) => { total: number; clashes: { id: string }[] } };
    expect(ids(blob.findClashes(A, B, 0.02, 20000))).toEqual(ids(findClashes(A, B)));
    const sets = [A, B, scene("C", 300)];
    const run = computeClashRun(sets), wrk = blob.computeClashRun(sets, new Set(), 0.02);
    expect([wrk.total, ids(wrk.clashes)]).toEqual([run.total, ids(run.clashes)]);
  });
});
