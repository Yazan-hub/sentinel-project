// MA-8-5: the LOA band. The real table is UNREAD (step 0: the USIBD spec is the founder's download), so these tests pin the unread
// behaviour on the shipped constants and the band logic on a TEST-ONLY table: its numbers are NOT the USIBD spec's.
import { describe, it, expect } from "vitest";
import { loaBand, loaWords, LOA_BANDS, LOA_SPEC, LOA_UNREAD, type LoaBandRow } from "./loa";

// TEST-ONLY sample (invented values, not the spec): lowest upper first; the first band's bound is inclusive, the second's is not.
const SAMPLE: LoaBandRow[] = [{ band: "SAMPLE-A", upper_mm: 10, inclusive: true }, { band: "SAMPLE-B", upper_mm: 30, inclusive: false }];
const wall = (status: string, p95_mm?: number | null) => ({ kind: "wall", status, p95_mm });

describe("loaBand: the shipped constants (step 0 not done)", () => {
  it("is unread: no source, no date, no rows, and every judged wall reads the waiting words", () => {
    expect(LOA_SPEC).toMatchObject({ status: "unread", source: null, read_on: null });
    expect(LOA_BANDS).toEqual([]);
    expect(loaBand(wall("within_tolerance", 3))).toEqual({ band: null, why: LOA_UNREAD });
    expect(loaBand(wall("out_of_tolerance", 63))).toEqual({ band: null, why: "no band — the LOA table waits for the USIBD spec read (step 0)" });
    expect(loaWords(wall("within_tolerance", 3))).toBe(LOA_UNREAD);
  });
  it("a spec marked read must name a table and a page and carry a date (a guard against a half-filled constant)", () => {
    if (LOA_SPEC.status === "read") {
      expect(LOA_SPEC.read_on).toMatch(/^\d{4}-\d\d-\d\d$/);
      expect(LOA_SPEC.source).toMatch(/Table\s+\S+.*p\.\s*\d+/);
      expect(LOA_BANDS.length).toBeGreaterThan(0);
    } else expect(LOA_BANDS).toEqual([]);
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
});
