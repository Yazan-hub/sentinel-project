// MA-4d — WallLocation.Locate ported (wall-location.mjs): tools/promote-check/LayerFreePlanner.cs's cases and words, so the bridge reads a
// survey wall inside or outside exactly as Promote reads a Revit wall.
import { describe, it, expect } from "vitest";
import { locate, EXTERIOR, INTERIOR } from "./wall-location.mjs";

const Seg = (x0, y0, x1, y1, width = 200) => ({ x0, y0, x1, y1, width });
// make-concept.py's layout: a 24 x 12 m outline of eight walls, ten partitions off the corridor, two free-standing gap walls in it.
const Concept = () => {
  const s = [Seg(0, 0, 12000, 0), Seg(12000, 0, 24000, 0), Seg(24000, 0, 24000, 6000), Seg(24000, 6000, 24000, 12000),
    Seg(24000, 12000, 12000, 12000), Seg(12000, 12000, 0, 12000), Seg(0, 12000, 0, 6000), Seg(0, 6000, 0, 0)];
  for (const x of [4000, 8000, 12000, 16000, 20000]) { s.push(Seg(x, 0, x, 4500, 100)); s.push(Seg(x, 7500, x, 12000, 100)); }
  s.push(Seg(2000, 6000, 6000, 6000, 125)); s.push(Seg(18000, 6000, 22000, 6000, 125));
  return s;
};
const L = (w, i) => locate(w, i).location, W = (w, i) => locate(w, i).why;
const OVERLAP = "its sample point lies beyond another wall's centreline (overlapping walls) — a person decides";
const range = (a, b) => Array.from({ length: b - a }, (_, k) => a + k);

describe("locate — WallLocation.Locate, rule for rule (MA-4d)", () => {
  it("the concept layout: eight outline walls Exterior, ten partitions and the two gap walls Interior", () => {
    const c = Concept();
    expect(range(0, 8).map((i) => L(c, i))).toEqual(Array(8).fill(EXTERIOR));
    expect(range(8, 20).map((i) => L(c, i))).toEqual(Array(12).fill(INTERIOR));
  });
  it("unknown, in the C# words: free-standing, too few walls, too short, no line", () => {
    const free = Concept(); free.push(Seg(30000, 0, 34000, 0));
    expect(W(free, 20)).toBe("both sides look out to open plan — a free-standing wall, or the storey's walls do not close around it");
    expect(W([Seg(0, 0, 5000, 0), Seg(5000, 0, 5000, 5000), Seg(5000, 5000, 0, 5000)], 0)).toBe("only 2 other wall(s) on the storey — no outline to be inside or outside of");
    const short = Concept(); short.push(Seg(6000, 2000, 6300, 2000, 100));
    expect(W(short, 20)).toBe("300 mm long — too short to look out from (under 500 mm)");
    const none = Concept(); none.push(null);
    expect([W(none, 20), L(none, 0)]).toEqual(["no location line was read", EXTERIOR]);
  });
  it("an L and a U read every wall Exterior; a closed courtyard reads Interior (the ceiling the C# file states)", () => {
    const l = [Seg(0, 0, 12000, 0), Seg(12000, 0, 12000, 6000), Seg(12000, 6000, 6000, 6000), Seg(6000, 6000, 6000, 12000), Seg(6000, 12000, 0, 12000), Seg(0, 12000, 0, 0)];
    expect(range(0, 6).map((i) => L(l, i))).toEqual(Array(6).fill(EXTERIOR));
    const u = [Seg(0, 0, 18000, 0), Seg(18000, 0, 18000, 12000), Seg(18000, 12000, 12000, 12000), Seg(12000, 12000, 12000, 4000),
      Seg(12000, 4000, 6000, 4000), Seg(6000, 4000, 6000, 12000), Seg(6000, 12000, 0, 12000), Seg(0, 12000, 0, 0)];
    expect(range(0, 8).map((i) => L(u, i))).toEqual(Array(8).fill(EXTERIOR));
    const o = [Seg(0, 0, 18000, 0), Seg(18000, 0, 18000, 12000), Seg(18000, 12000, 0, 12000), Seg(0, 12000, 0, 0),
      Seg(6000, 4000, 12000, 4000), Seg(12000, 4000, 12000, 8000), Seg(12000, 8000, 6000, 8000), Seg(6000, 8000, 6000, 4000)];
    expect(range(0, 8).map((i) => L(o, i))).toEqual([...Array(4).fill(EXTERIOR), ...Array(4).fill(INTERIOR)]);
  });
  it("overlaps are a person's (C23); a lining is read past (F-MA2a-1); a wall of unknown width, an equal leaf, a 60 mm wall and a skewed one are no linings", () => {
    const thick = [Seg(0, 0, 12000, 0), Seg(12000, 0, 12000, 8000), Seg(12000, 8000, 0, 8000), Seg(0, 8000, 0, 0, 600), Seg(100, 1000, 100, 7000, 100)];
    expect([W(thick, 4), W(thick, 3), L(thick, 0), L(thick, 1), L(thick, 2)]).toEqual([OVERLAP, OVERLAP, EXTERIOR, EXTERIOR, EXTERIOR]);
    const abut = [...thick]; abut[4] = Seg(350, 1000, 350, 7000, 100);
    expect([L(abut, 4), W(abut, 3)]).toEqual([INTERIOR, OVERLAP]);
    const deep = [...thick]; deep[4] = Seg(200, 1000, 200, 7000, 100);
    expect(W(deep, 4)).toBe("its body overlaps a parallel wall's body (a wall drawn inside another) — a person decides");
    const lined = Concept(); lined.push(Seg(16520, -134, 24520, -134, 6));
    expect(range(0, 8).map((i) => L(lined, i))).toEqual(Array(8).fill(EXTERIOR));
    const finish = Concept(); finish.push(Seg(16520, -110, 24520, -110, 20)); finish.push(Seg(16520, -126, 24520, -126, 6));
    expect(L(finish, 1)).toBe(EXTERIOR);
    const thickLining = Concept(); thickLining.push(Seg(16520, -134, 24520, -134, 60));
    const leaves = Concept(); leaves[1] = Seg(12000, 0, 24000, 0, 100); leaves.push(Seg(12000, 150, 24000, 150, 100));
    const skew = Concept(); skew.push(Seg(16520, -234, 24520, 0, 6));
    const stacked = [Seg(0, 0, 12000, 0), Seg(12000, 0, 12000, 8000), Seg(12000, 8000, 0, 8000), Seg(0, 8000, 0, 0, 0), Seg(100, 1000, 100, 7000, 100)];
    expect([L(thickLining, 1), L(leaves, 1), L(leaves, 20), W(skew, 1), W(stacked, 4)]).toEqual([null, null, null, OVERLAP, OVERLAP]);
  });
});
