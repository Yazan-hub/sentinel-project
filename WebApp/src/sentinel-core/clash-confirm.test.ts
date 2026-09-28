import { describe, it, expect } from "vitest";
import type { Clash, ClashItem } from "./clash";
import { candidateGroups, confirm, runSentence, type SolidHit } from "./clash-confirm";

const item = (modelId: string, localId: number, guid?: string): ClashItem => ({ modelId, localId, guid, box: { min: [0, 0, 0], max: [1, 1, 1] } });
const cand = (a: ClashItem, b: ClashItem, volume = 0.5): Clash => ({ id: `${a.guid ?? a.localId}|${b.guid ?? b.localId}`, a, b, overlap: [1, 1, 1], volume });
const hit = (ma: string, la: number, mb: string, lb: number, extra: Partial<SolidHit> = {}): SolidHit => ({ modelA: ma, localA: la, modelB: mb, localB: lb, ...extra });

describe("candidateGroups", () => {
  it("groups by model pair, whatever order the pair came in, and gives each side only its own candidates", () => {
    const g = candidateGroups([cand(item("ARC", 1), item("STR", 7)), cand(item("STR", 8), item("ARC", 2)), cand(item("ARC", 3), item("MEP", 9))]);
    expect(g).toHaveLength(2);
    const arcStr = g.find((x) => x.modelB === "STR")!;
    expect([arcStr.modelA, [...arcStr.idsA].sort(), [...arcStr.idsB].sort()]).toEqual(["ARC", [1, 2], [7, 8]]);
  });
  it("a single model is one set against itself", () => {
    const [g] = candidateGroups([cand(item("ARC", 1), item("ARC", 2))]);
    expect([g.modelA, g.modelB, [...g.idsA].sort(), [...g.idsB].sort()]).toEqual(["ARC", "ARC", [1, 2], [1, 2]]);
  });
});

describe("confirm", () => {
  const c1 = cand(item("ARC", 1, "g1"), item("STR", 7, "g7"), 2.0);
  const c2 = cand(item("ARC", 2, "g2"), item("STR", 8, "g8"), 3.0); // boxes overlap, solids do not
  const c3 = cand(item("ARC", 3, "g3"), item("MEP", 9, "g9"), 0.1);

  it("keeps only the candidates the solids confirm, in either order, and counts the rest as dropped", () => {
    const r = confirm([c1, c2, c3], [hit("STR", 7, "ARC", 1, { volume: 0.02 }), hit("ARC", 3, "MEP", 9, { volume: 0.4 })], { type: "hard" });
    expect(r.clashes.map((c) => c.id)).toEqual(["g3|g9", "g1|g7"]); // ranked by the solids' volume, not the boxes'
    expect(r.clashes.map((c) => c.volume)).toEqual([0.4, 0.02]);
    expect([r.dropped, r.touching]).toEqual([1, 0]);
  });
  it("a hit that was never a candidate, or an element against itself, confirms nothing", () => {
    const r = confirm([c1], [hit("ARC", 1, "ARC", 1), hit("ARC", 5, "STR", 7)], { type: "hard" });
    expect([r.clashes.length, r.dropped]).toEqual([0, 1]);
  });
  it("solids that meet with no overlap volume are kept, marked touching, listed after the overlaps — never ranked by box volume", () => {
    const r = confirm([c2, c1, c3], [hit("ARC", 2, "STR", 8, { volume: 0 }), hit("ARC", 1, "STR", 7), hit("ARC", 3, "MEP", 9, { volume: 0.004 })], { type: "hard" });
    expect(r.clashes.map((c) => [c.id, c.volume, !!c.touching])).toEqual([["g3|g9", 0.004, false], ["g2|g8", 0, true], ["g1|g7", 0, true]]);
    expect([r.touching, r.dropped]).toEqual([2, 0]);
  });
  it("clearance ranks the closest pair first and carries the distance", () => {
    const r = confirm([c1, c3], [hit("ARC", 1, "STR", 7, { distance: 0.04 }), hit("ARC", 3, "MEP", 9, { distance: 0.01 })], { type: "clearance", distance: 0.05 });
    expect(r.clashes.map((c) => [c.id, c.distance])).toEqual([["g3|g9", 0.01], ["g1|g7", 0.04]]);
    expect(r.touching).toBe(0);
  });
});

describe("runSentence", () => {
  it("says what the boxes proposed, what the solids confirmed and what was dropped", () => {
    const confirmed = { clashes: [c(), c()], dropped: 410, touching: 0 };
    expect(runSentence({ modelCount: 2, scanned: 12345, candidates: 412, known: 3, mode: { type: "hard" }, confirmed }))
      .toBe("2 models · 12,345 elements · 412 box overlap(s) (3 already in the register, not re-checked) → 2 clash(es) on the solids, 410 boxes only (dropped). Click one to isolate.");
  });
  it("a hard run with touching pairs says how many overlap and how many only touch", () => {
    const confirmed = { clashes: [c(), c(), c()], dropped: 5, touching: 2 };
    expect(runSentence({ modelCount: 1, scanned: 602, candidates: 8, known: 0, mode: { type: "hard" }, confirmed }))
      .toBe("1 model against itself · 602 elements · 8 box overlap(s) → 3 clash(es) on the solids (1 overlapping, 2 touching — no overlap volume), 5 boxes only (dropped). Click one to isolate.");
  });
  it("never passes boxes off as clashes: a failed exact check is said on the line", () => {
    expect(runSentence({ modelCount: 1, scanned: 900, candidates: 12, known: 0, mode: { type: "hard" }, solidsError: "Collider: worker lost" }))
      .toBe("1 model against itself · 900 elements · 12 clash(es) by boxes only — the solids were not checked: Collider: worker lost.");
  });
  it("clearance is worded as a distance", () => {
    const confirmed = { clashes: [c()], dropped: 0, touching: 0 };
    expect(runSentence({ modelCount: 2, scanned: 10, candidates: 1, known: 0, mode: { type: "clearance", distance: 0.05 }, confirmed }))
      .toBe("2 models · 10 elements · 1 box overlap(s) → 1 element pair(s) closer than 0.05 m on the solids, 0 boxes only (dropped). Click one to isolate.");
  });
  function c(): Clash { return cand(item("A", 1), item("B", 2)); }
});
