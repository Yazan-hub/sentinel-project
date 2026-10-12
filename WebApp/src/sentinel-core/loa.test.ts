// MA-8-5 / 8-5b: the LOA band. The shipped table is USIBD C120 v3.1 p. 15; the unread behaviour is pinned by passing [] and the band
// logic on a TEST-ONLY table: its numbers are NOT the USIBD spec's.
import { describe, it, expect } from "vitest";
import { loaBand, loaWords, loaSpecProblem, LOA_BANDS, LOA_SPEC, LOA_UNREAD, type LoaBandRow } from "./loa";

// TEST-ONLY sample (invented values, not the spec): lowest upper first; the first band's bound is inclusive, the second's is not.
const SAMPLE: LoaBandRow[] = [{ band: "SAMPLE-A", upper_mm: 10, inclusive: true }, { band: "SAMPLE-B", upper_mm: 30, inclusive: false }];
const wall = (status: string, p95_mm?: number | null) => ({ kind: "wall", status, p95_mm });

describe("loaBand: the shipped constants (USIBD C120 v3.1 p. 15)", () => {
  it("is read, cites its table and page, and passes the half-filled guard", () => {
    expect(LOA_SPEC).toMatchObject({ status: "read", read_on: "2026-10-12" });
    expect(LOA_SPEC.source).toMatch(/C120.*v?3\.1|v3\.1.*C120/);
    expect(LOA_SPEC.statistic).toMatch(/95 %/);
    expect(loaSpecProblem(LOA_SPEC, LOA_BANDS)).toBeNull();
  });
  it("pins every band edge: bounds are exclusive and take the lower band (a rounded 5.0 may be 5.04)", () => {
    const at = (p: number) => (loaBand(wall("within_tolerance", p)) as { band: string | null }).band;
    expect([0, 1, 1.01, 5, 5.01, 15, 15.01, 50, 50.01, 150, 150.01].map(at))
      .toEqual(["LOA50", "LOA40", "LOA40", "LOA30", "LOA30", "LOA20", "LOA20", "LOA10", "LOA10", null, null]);
  });
  it("words: the band, the source, relative to the scan, not independently validated; over 150 mm no band", () => {
    expect(loaWords(wall("out_of_tolerance", 23))).toBe(`LOA20 (p95 23 mm, ${LOA_SPEC.source}, relative to the scan, not independently validated)`);
    expect(loaWords(wall("out_of_tolerance", 150))).toBe("no band — over 150 mm, beyond LOA10 (the lowest USIBD level)");
    expect(loaWords({ kind: "floor", status: "within_tolerance", p95_mm: 3 })).toBe("no band — only walls are measured");
  });
  it("an empty table (unread) reads the waiting words", () => {
    expect(loaBand(wall("within_tolerance", 3), [])).toEqual({ band: null, why: LOA_UNREAD });
  });
  it("the guard fails a spec marked read that is half filled, and passes a whole one", () => {
    const good = { ...LOA_SPEC, status: "read" as const, read_on: "2026-10-20", source: "USIBD LOA Specification v3.0, Table 1, p. 5", statistic: "95 % (2σ)" };
    expect(loaSpecProblem(good, SAMPLE)).toBeNull();
    expect(loaSpecProblem({ ...good, source: "USIBD LOA Specification v3.0, Table 1" }, SAMPLE)).toMatch(/table and page/);
    expect(loaSpecProblem({ ...good, source: "USIBD spec, Table, p. 5" }, SAMPLE)).toMatch(/table and page/); // no table name
    expect(loaSpecProblem({ ...good, read_on: "20 Oct 2026" }, SAMPLE)).toMatch(/date/);
    expect(loaSpecProblem({ ...good, statistic: null }, SAMPLE)).toMatch(/statistic/);
    expect(loaSpecProblem({ ...good, statistic: "RMSE" }, SAMPLE)).toMatch(/statistic/);
    expect(loaSpecProblem(good, [])).toMatch(/no bands/);
    expect(loaSpecProblem({ ...LOA_SPEC, status: "unread" }, SAMPLE)).toMatch(/unread/);
  });
});

describe("loaBand: the logic, on a test-only table", () => {
  it("picks the first band whose upper bound holds, by its inclusivity", () => {
    expect(loaBand(wall("within_tolerance", 0), SAMPLE)).toEqual({ band: "SAMPLE-A", p95_mm: 0 });
    expect(loaBand(wall("within_tolerance", 10), SAMPLE)).toEqual({ band: "SAMPLE-A", p95_mm: 10 }); // inclusive
    expect(loaBand(wall("out_of_tolerance", 10.01), SAMPLE)).toEqual({ band: "SAMPLE-B", p95_mm: 10.01 });
    expect(loaBand(wall("out_of_tolerance", 29.99), SAMPLE)).toEqual({ band: "SAMPLE-B", p95_mm: 29.99 });
    expect(loaBand(wall("out_of_tolerance", 30), SAMPLE)).toMatchObject({ band: null }); // exclusive, and past the last row
  });
  it("a face with an interior but no scan point gives no band, even with a good pooled p95", () => {
    const faces = (...f: [number, number | null][]) => f.map(([points, coverage]) => ({ points, coverage }));
    expect(loaBand({ ...wall("out_of_tolerance", 3), faces: faces([900, 1], [0, 0]) }, SAMPLE)).toEqual({ band: null, why: "no band — face 2 has no scan point" });
    expect(loaBand({ ...wall("within_tolerance", 3), faces: faces([900, 1], [0, null]) }, SAMPLE)).toMatchObject({ band: "SAMPLE-A" }); // no interior: nothing to see
  });
  it("a negative, NaN, missing or infinite p95 gives no band", () => {
    for (const p of [-1, NaN, null, undefined, Infinity]) expect(loaBand(wall("within_tolerance", p), SAMPLE)).toMatchObject({ band: null });
  });
  it("insufficient data, missing and not measured give their words, a floor's not_measured too (status words first)", () => {
    expect(loaBand(wall("insufficient_data", 5), SAMPLE)).toEqual({ band: null, why: "no band — insufficient data" });
    expect(loaBand(wall("missing", null), SAMPLE)).toEqual({ band: null, why: "no band — missing" });
    expect(loaBand(wall("not_measured"), SAMPLE)).toEqual({ band: null, why: "no band — not measured" });
    expect(loaBand({ kind: "floor", status: "not_measured" }, SAMPLE)).toEqual({ band: null, why: "no band — not measured" });
    expect(loaBand({ kind: "floor", status: "not_measured" })).toEqual({ band: null, why: "no band — not measured" }); // also on the unread table
  });
  it("a judged non-wall (or a row with no kind) gives no band", () => {
    expect(loaBand({ kind: "door", status: "within_tolerance", p95_mm: 2 }, SAMPLE)).toEqual({ band: null, why: "no band — only walls are measured" });
    expect(loaBand({ status: "within_tolerance", p95_mm: 2 }, SAMPLE)).toMatchObject({ band: null });
  });
  it("words: the filled-table sentence, the beyond-last-bound words and the not-judged words are pinned", () => {
    const spec = { source: "SAMPLE spec, Table 9, p. 1" };
    expect(loaWords(wall("within_tolerance", 23), SAMPLE, spec)).toBe("SAMPLE-B (p95 23 mm, SAMPLE spec, Table 9, p. 1, relative to the scan, not independently validated)");
    expect(loaWords(wall("out_of_tolerance", 40), SAMPLE, spec)).toMatch(/^no band — over 30 mm, beyond SAMPLE-B/);
    expect(loaBand(wall("weird", 5), SAMPLE)).toEqual({ band: null, why: "no band — not judged" });
    expect(loaWords(wall("weird", 5), SAMPLE, spec)).toBe("no band — not judged");
  });
});
