import { describe, it, expect } from "vitest";
import {
  VOCABULARY, MAX_CHANGESET_ELEMENTS,
  validateChangeset, attachVerdicts, canWithdraw, deriveResultStatus,
} from "./changesets-logic.mjs";

const wall = (over = {}) => ({
  kind: "wall",
  validate: { identity: { Class: "IFCWALL", Name: "W1" }, psets: [], quantities: [] },
  place: { TypeName: "Generic - 200mm", LevelName: "Level 1", LocationCurve: { start: [0, 0, 0], end: [5000, 0, 0] }, BaseElevation: 0, TopElevation: 3000 },
  ...over,
});
const level = (over = {}) => ({
  kind: "level",
  validate: { identity: { Class: "IFCBUILDINGSTOREY", Name: "L2" }, psets: [], quantities: [] },
  place: { BaseElevation: 3000 },
  ...over,
});
const CS = (elements, over = {}) => ({ name: "Core walls", source: "test-agent", elements, ...over });

describe("VOCABULARY", () => {
  it("is the frozen v1 list", () => expect(VOCABULARY).toEqual(["wall", "floor", "level", "grid"]));
});

describe("validateChangeset — shape", () => {
  it("accepts a valid changeset, assigns unique proposal_guids and syncs missing GlobalIds", () => {
    const v = validateChangeset(CS([wall(), level()]));
    expect(v.name).toBe("Core walls");
    expect(v.elements).toHaveLength(2);
    const guids = v.elements.map((e) => e.proposal_guid);
    expect(new Set(guids).size).toBe(2);
    for (const e of v.elements) {
      expect(e.proposal_guid).toMatch(/^[0-9a-f-]{36}$/i);
      expect(e.validate.identity.GlobalId).toBe(e.proposal_guid); // synced when absent
    }
  });

  it("keeps a caller-supplied GlobalId (does not overwrite)", () => {
    const w = wall();
    w.validate.identity.GlobalId = "agent-gid-1";
    const v = validateChangeset(CS([w]));
    expect(v.elements[0].validate.identity.GlobalId).toBe("agent-gid-1");
  });

  it("requires a name and a non-empty elements array", () => {
    expect(() => validateChangeset(CS([], { name: "" }))).toThrow(/name/i);
    expect(() => validateChangeset(CS([]))).toThrow(/elements/i);
    expect(() => validateChangeset({ name: "x", elements: "nope" })).toThrow(/elements/i);
  });

  it("rejects a kind outside the vocabulary, naming the element index and the allowed set", () => {
    try { validateChangeset(CS([wall(), { ...wall(), kind: "door" }])); throw new Error("no throw"); }
    catch (e) {
      expect(e.status).toBe(400);
      expect(e.message).toMatch(/\[1\]/);
      expect(e.message).toMatch(/wall, floor, level, grid/);
    }
  });

  it("413 over the element cap", () => {
    const many = Array.from({ length: MAX_CHANGESET_ELEMENTS + 1 }, () => wall());
    try { validateChangeset(CS(many)); throw new Error("no throw"); }
    catch (e) { expect(e.status).toBe(413); }
  });

  it("requires validate.identity.Class on every element", () => {
    const bad = wall(); delete bad.validate.identity.Class;
    expect(() => validateChangeset(CS([bad]))).toThrow(/\[0\].*identity\.Class/i);
  });
});

describe("validateChangeset — per-kind place rules", () => {
  it("wall/grid need a two-point LocationCurve with finite numbers", () => {
    const noCurve = wall(); delete noCurve.place.LocationCurve;
    expect(() => validateChangeset(CS([noCurve]))).toThrow(/LocationCurve/);
    const badNum = wall({ place: { ...wall().place, LocationCurve: { start: [0, 0, 0], end: [NaN, 0, 0] } } });
    expect(() => validateChangeset(CS([badNum]))).toThrow(/finite/i);
    const grid = { kind: "grid", validate: { identity: { Class: "IFCGRID", Name: "A" } }, place: { LocationCurve: { start: [0, 0, 0], end: [0, 9000, 0] } } };
    expect(validateChangeset(CS([grid])).elements[0].kind).toBe("grid");
  });

  it("floor needs a closed LocationLoop of ≥3 points", () => {
    const floor = { kind: "floor", validate: { identity: { Class: "IFCSLAB", Name: "F1" } }, place: { LevelName: "Level 1", LocationLoop: [[0, 0, 0], [5000, 0, 0], [5000, 5000, 0]] } };
    expect(validateChangeset(CS([floor])).elements[0].kind).toBe("floor");
    const two = { ...floor, place: { ...floor.place, LocationLoop: [[0, 0, 0], [1, 1, 0]] } };
    expect(() => validateChangeset(CS([two]))).toThrow(/LocationLoop/);
  });

  it("level needs a finite numeric BaseElevation", () => {
    const bad = level({ place: { BaseElevation: "high" } });
    expect(() => validateChangeset(CS([bad]))).toThrow(/BaseElevation/);
  });
});

describe("attachVerdicts", () => {
  const elems = () => validateChangeset(CS([wall(), level()])).elements;

  it("maps adjudication failures to the right element by GlobalId; clean elements are accepted", () => {
    const e = elems();
    const adj = { verdict: "rejected", ids_source: "server", failures: [{ element: e[0].validate.identity.GlobalId, requirement: "FireRating" }] };
    const out = attachVerdicts(e, adj);
    expect(out[0].verdict.status).toBe("rejected");
    expect(out[0].verdict.failures).toHaveLength(1);
    expect(out[1].verdict.status).toBe("accepted");
    expect(out[1].verdict.failures).toEqual([]);
  });

  it("with no spec (recorded), every element is recorded — never accepted", () => {
    const adj = { verdict: "recorded", ids_source: "none", failures: [] };
    for (const el of attachVerdicts(elems(), adj)) expect(el.verdict.status).toBe("recorded");
  });

  it("does not mutate its inputs", () => {
    const e = elems();
    attachVerdicts(e, { verdict: "recorded", ids_source: "none", failures: [] });
    expect(e[0].verdict).toBeUndefined();
  });
});

describe("lifecycle helpers", () => {
  it("canWithdraw only from proposed", () => {
    expect(canWithdraw("proposed")).toBe(true);
    for (const s of ["applied", "partially_applied", "declined", "withdrawn"]) expect(canWithdraw(s)).toBe(false);
  });

  it("deriveResultStatus: all→applied, some→partially_applied, none→declined", () => {
    expect(deriveResultStatus(3, 0, 3)).toBe("applied");
    expect(deriveResultStatus(2, 1, 3)).toBe("partially_applied");
    expect(deriveResultStatus(0, 3, 3)).toBe("declined");
  });

  it("throws when the counts don't account for every element", () => {
    expect(() => deriveResultStatus(1, 1, 3)).toThrow(/account/i);
  });
});
