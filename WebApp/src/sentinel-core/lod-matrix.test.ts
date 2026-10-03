// MA-2b: the one lod_matrix@n reader. The cases are shared with the add-in's twin (tools/promote-check reads the same file
// into LodMatrix.FromBody) and with the bundle (bridge/sentinel-core-bundle.test.mjs), so all three accept and refuse the
// same bodies in the same words, and read the same stage map, snap and properties.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseLodMatrix, DEFAULT_STAGE_MAP, STAGES } from "./lod-matrix";
import { GATE_DEFS } from "./gates";

type Case = { name: string; body: unknown; error: string | null; stage_map?: Record<string, string>; snap?: Record<string, number>; properties?: Record<string, string[]> };
const CASES: Case[] = JSON.parse(readFileSync("bridge/fixtures/lod-matrix/cases.json", "utf8"));
const snapOf = (m: ReturnType<typeof parseLodMatrix>) => Object.fromEntries(m.rows.map((r) => [r.category, r.type_snap_mm]));

describe("parseLodMatrix (MA-2b, TS ↔ C# ↔ bridge bundle)", () => {
  it("holds 26 cases, both kinds", () => {
    expect(CASES.length).toBe(26);
    expect(CASES.filter((c) => c.error === null).length).toBe(5);
  });
  it.each(CASES.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    if (c.error !== null) {
      let said: string | null = null;
      try { parseLodMatrix(c.body); } catch (e) { said = (e as Error).message; }
      expect(said).toBe(c.error);
      return;
    }
    const m = parseLodMatrix(c.body);
    expect(m.stage_map).toEqual(c.stage_map);
    expect(snapOf(m)).toEqual(c.snap);
    expect(Object.fromEntries(m.rows.map((r) => [r.category, r.properties]))).toEqual(c.properties); // what the LOD state and matrixToIds ask
  });
  it("the demo matrix (a v0 body) reads as before: DRAFT, D18's stage map, every row exact, properties kept, DD rules apart", () => {
    const m = parseLodMatrix(JSON.parse(readFileSync("../demo/bds-pilot/bds-lod-matrix-dd.json", "utf8")));
    expect(m.draft).toBe(true);
    expect(m.stage_map).toEqual(DEFAULT_STAGE_MAP);
    expect(m.rows.map((r) => r.category)).toEqual(["Walls", "Floors", "Roofs", "Ceilings", "Doors", "Windows"]);
    expect(m.rows.every((r) => r.type_snap_mm === 0)).toBe(true);
    expect(m.rows[4]).toEqual({ category: "Doors", dd: { type: "guideline_rule", level: "story_level", host: "wall" }, type_snap_mm: 0,
      properties: ["Pset_DoorCommon.IsExternal", "Pset_DoorCommon.FireRating"] });
  });
  it("one stage list (D18): the gate's stages are the matrix's project stages", () => {
    expect(Object.keys(GATE_DEFS).every((s) => STAGES.includes(s))).toBe(true);
    expect(Object.values(DEFAULT_STAGE_MAP).every((s) => STAGES.includes(s))).toBe(true);
  });
});
