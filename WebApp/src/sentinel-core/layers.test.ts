import { describe, it, expect } from "vitest";
import { mapLayer, validateLayers, type LayerRuleset } from "./layers";

const RS: LayerRuleset = {
  standard: "Test Layer Standard",
  enforce: "warn",
  match: { caseInsensitive: true, trim: true },
  ignore: ["0", "DEFPOINTS", "*-ANNO-*", "*-DIMS", "*-GRID"],
  disciplines: { A: "Architectural", S: "Structural", M: "Mechanical" },
  layers: [
    { layer: "A-WALL-EXT", category: "Walls", family: "BDS_Wall_Ext", params: { IsExternal: true, Discipline: "A" }, aliases: ["WALL-EXT", "A-WALL-EXTERNAL"] },
    { layer: "A-DOOR", category: "Doors", family: "BDS_Door", params: { Discipline: "A" }, aliases: ["DOOR"] },
    { layer: "A-WALL-FIRE", category: "Walls", family: "BDS_Wall_Fire", requires: ["FireRating"] },
  ],
  extensions: [{ layer: "M-DUCT", major: "DUCT", note: "duct → MEP void" }],
};

describe("mapLayer", () => {
  it("exact canonical match → deterministic, confidence 1, no AI", () => {
    const m = mapLayer("A-WALL-EXT", RS);
    expect(m.kind).toBe("exact");
    expect(m.compliant).toBe(true);
    expect(m.category).toBe("Walls");
    expect(m.family).toBe("BDS_Wall_Ext");
    expect(m.params?.IsExternal).toBe(true);
    expect(m.confidence).toBe(1);
    expect(m.needsAI).toBe(false);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(mapLayer("  a-wall-ext ", RS).kind).toBe("exact");
  });

  it("alias maps confidently but is non-compliant, with a rename suggestion", () => {
    const m = mapLayer("A-WALL-EXTERNAL", RS);
    expect(m.kind).toBe("alias");
    expect(m.compliant).toBe(false);
    expect(m.category).toBe("Walls");
    expect(m.suggestion).toBe("A-WALL-EXT");
    expect(m.needsAI).toBe(false);
    expect(m.confidence).toBeCloseTo(0.95);
  });

  it("ignores non-model layers (annotation, system) — not an error", () => {
    for (const l of ["A-ANNO-TEXT", "A-DIMS", "0", "DEFPOINTS", "S-GRID"]) {
      const m = mapLayer(l, RS);
      expect(m.ignored, l).toBe(true);
      expect(m.compliant, l).toBe(true);
      expect(m.needsAI, l).toBe(false);
    }
  });

  it("parses standard-format layers not in the table → derived category + minor params", () => {
    const m = mapLayer("A-WIND-INT", RS); // not listed, but conforms to D-MAJR-MINR
    expect(m.kind).toBe("pattern");
    expect(m.category).toBe("Windows");
    expect(m.params?.IsExternal).toBe(false);
    expect(m.params?.Discipline).toBe("A");
    expect(m.compliant).toBe(true);
    expect(m.needsAI).toBe(false);
  });

  it("flags FIRE minor as requiring a FireRating", () => {
    const m = mapLayer("A-COLS-FIRE", RS);
    expect(m.category).toBe("Columns");
    expect(m.requires).toEqual(["FireRating"]);
  });

  it("recognizes an extension layer but marks it needs-support", () => {
    const m = mapLayer("M-DUCT", RS);
    expect(m.kind).toBe("extension");
    expect(m.compliant).toBe(true);
    expect(m.needsAI).toBe(true); // not a v1 build category
  });

  it("unrecognized name → needs AI, with a keyword rename guess", () => {
    const m = mapLayer("walls new (2)", RS);
    expect(m.kind).toBe("none");
    expect(m.compliant).toBe(false);
    expect(m.needsAI).toBe(true);
    expect(m.suggestion).toBe("A-WALL-INT");
    expect(m.confidence).toBe(0);
  });

  it("empty name is handled, not thrown", () => {
    const m = mapLayer("", RS);
    expect(m.needsAI).toBe(true);
    expect(m.reason).toMatch(/empty/);
  });
});

describe("validateLayers", () => {
  const names = ["A-WALL-EXT", "WALL-EXT", "A-ANNO-TEXT", "random layer"];

  it("summarizes compliant / ignored / non-compliant / needs-AI", () => {
    const v = validateLayers(names, RS);
    expect(v.total).toBe(4);
    expect(v.counts.compliant).toBe(1);   // A-WALL-EXT
    expect(v.counts.ignored).toBe(1);      // A-ANNO-TEXT
    expect(v.counts.nonCompliant).toBe(2); // WALL-EXT (alias) + random
    expect(v.counts.needsAI).toBe(1);      // random only (alias maps deterministically)
    expect(v.nonCompliant.map((n) => n.input)).toContain("WALL-EXT");
  });

  it("warn enforcement → 'warn' when non-compliant layers exist", () => {
    expect(validateLayers(names, RS).verdict).toBe("warn");
  });

  it("reject enforcement → 'rejected'", () => {
    expect(validateLayers(names, { ...RS, enforce: "reject" }).verdict).toBe("rejected");
  });

  it("off enforcement → always 'ok'", () => {
    expect(validateLayers(names, { ...RS, enforce: "off" }).verdict).toBe("ok");
  });

  it("all-compliant list → 'ok'", () => {
    expect(validateLayers(["A-WALL-EXT", "A-DOOR", "A-ANNO-TEXT"], RS).verdict).toBe("ok");
  });
});
