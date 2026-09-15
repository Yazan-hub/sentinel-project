import { describe, it, expect } from "vitest";
import { compileIds, sentences } from "./ids-compile.mjs";

const one = (text) => compileIds(text).specifications[0];

describe("sentences", () => {
  it("splits on terminators and newlines and strips bullets", () => {
    expect(sentences("- All doors shall carry a fire rating.\n* Walls must be load-bearing."))
      .toEqual(["All doors shall carry a fire rating.", "Walls must be load-bearing."]);
  });
  it("drops fragments too short to be a requirement", () => {
    expect(sentences("ok.\nAll doors shall carry a fire rating.")).toHaveLength(1);
  });
});

describe("compileIds", () => {
  it("compiles the canonical clause into an IDS specification", () => {
    const s = one("All fire doors shall carry a fire rating.");
    expect(s.applicability.entity).toBe("IFCDOOR");
    expect(s.requirements.properties[0]).toMatchObject({ name: "FireRating", cardinality: "required" });
  });

  it("keeps the source sentence on every specification — review is the point", () => {
    const text = "All windows shall record a thermal transmittance.";
    expect(one(text).source_sentence).toBe(text);
  });

  it("reads an explicit Pset.Property over any vocabulary guess", () => {
    const s = one("Every element shall carry Pset_BDS.Discipline.");
    expect(s.requirements.properties[0]).toMatchObject({ pset: "Pset_BDS", name: "Discipline" });
    expect(s.confidence).toBe("high");
  });

  it("extracts a required value when the clause names both the property and the value", () => {
    expect(one("The fire rating of all doors shall be REI60.").requirements.properties[0].value).toBe("REI60");
  });

  it("refuses to infer the property from a value alone — REI60 implies a fire rating to a human, not to a gate", () => {
    const r = compileIds("All fire doors shall be REI60.");
    expect(r.specifications).toEqual([]);
    expect(r.unmatched[0].reason).toMatch(/no property could be identified/);
  });

  it("does not mistake an action for a value", () => {
    const s = one("The fire rating of all doors shall be recorded.");
    expect(s.requirements.properties[0].value).toBeUndefined();
    expect(s.requirements.properties[0].cardinality).toBe("required");
  });

  it("compiles a negative clause as prohibited, never as required", () => {
    const s = one("Walls shall not carry a fire rating.");
    expect(s.requirements.properties[0].cardinality).toBe("prohibited");
    expect(s.requirements.properties[0].value).toBeUndefined();
  });

  it("ignores prose that states no requirement at all", () => {
    const r = compileIds("This document describes the modelling approach for the project team.");
    expect(r.specifications).toEqual([]);
    expect(r.unmatched).toEqual([]);
    expect(r.stats.requirement_sentences).toBe(0);
  });

  it("NEVER drops a requirement silently — it lands in unmatched with a reason", () => {
    const r = compileIds("All information shall be accurate and shall be fit for purpose.");
    expect(r.specifications).toEqual([]);
    expect(r.unmatched).toHaveLength(1);
    expect(r.unmatched[0].reason).toMatch(/no IFC entity/);
  });

  it("names which half was missing so the author can fix the clause", () => {
    const noProp = compileIds("All doors shall be provided.").unmatched[0];
    expect(noProp.reason).toMatch(/no property could be identified/);
  });

  it("carries the proposal warning and honest stats on every output", () => {
    const r = compileIds("All doors shall carry a fire rating. All information shall be timely.");
    expect(r.note).toMatch(/A PROPOSAL, not a ruleset/);
    expect(r.stats).toEqual({ requirement_sentences: 2, compiled: 1, unmatched: 1 });
  });

  it("grades confidence by how much was read rather than inferred", () => {
    expect(one("All doors shall carry a fire rating.").confidence).toBe("low");
    expect(one("All doors shall carry FireRating.").confidence).toBe("medium");
    expect(one("All doors shall carry Pset_DoorCommon.FireRating.").confidence).toBe("high");
  });

  it("compiles a multi-clause document into several specifications", () => {
    const r = compileIds([
      "All fire doors shall carry a fire rating.",
      "Windows must record a thermal transmittance.",
      "Every element shall carry Pset_BDS.Discipline.",
      "The project team will meet weekly.",
    ].join("\n"));
    expect(r.specifications.map((s) => s.applicability.entity)).toEqual(["IFCDOOR", "IFCWINDOW", "IFCBUILDINGELEMENT"]);
  });

  it("tolerates empty and non-string input", () => {
    for (const bad of ["", null, undefined, 7]) expect(compileIds(bad).specifications).toEqual([]);
  });
});
