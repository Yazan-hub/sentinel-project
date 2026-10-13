import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  VOCABULARY, OPS, OP_KINDS, MAX_CHANGESET_ELEMENTS, TRUST_FIELDS, ADDIN_SOURCES, CREATE_ENTITY, PLACE_KEPT,
  validateChangeset, foreignOf, checkStairFlag, checkFromFlag, checkFromScan, keepBuilt, stairsOf, STAIR_FLAG_FIELDS, carryKey, outlineProblem, attachVerdicts, canWithdraw, deriveResultStatus, unattributedFailures, editCost, EDIT_COST_CEILING,
} from "./changesets-logic.mjs";
import * as core from "./sentinel-core.mjs";
import { makeTyper, makeCiter } from "./changesets-typing.mjs";

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
const status400 = (fn, re) => {
  try { fn(); throw new Error("no throw"); }
  catch (e) { expect(e.status).toBe(400); expect(e.message).toMatch(re); }
};
// MA-1a step 2 adds column and furniture (Ghost Builder's unhosted point families); MA-6-3 opening and beam (vocabulary v2); MA-6-6 mass.
// MA-8-10 stair. MA-8-14 terrain.
const MA1 = ["wall", "floor", "level", "grid", "roof", "ceiling", "door", "window", "column", "furniture", "room", "opening", "beam", "mass", "stair", "terrain"];

describe("VOCABULARY", () => {
  it("is the MA-1 list, with MA-1a step 2's column and furniture, MA-5b-1's room, MA-6-3's opening and beam, MA-6-6's mass, MA-8-10's stair and MA-8-14's terrain", () => expect(VOCABULARY).toEqual(MA1));
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
    try { validateChangeset(CS([wall(), { ...wall(), kind: "duct" }])); throw new Error("no throw"); }
    catch (e) {
      expect(e.status).toBe(400);
      expect(e.message).toMatch(/\[1\]/);
      expect(e.message).toMatch(/wall, floor, level, grid, roof, ceiling, door, window, column, furniture/);
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
    const floor = { kind: "floor", validate: { identity: { Class: "IFCSLAB", Name: "F1" } }, place: { TypeName: "Generic 150mm", LevelName: "Level 1", LocationLoop: [[0, 0, 0], [5000, 0, 0], [5000, 5000, 0]] } };
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
    const adj = { verdict: "rejected", ids_source: "project", failures: [{ element: e[0].validate.identity.GlobalId, requirement: "FireRating" }] };
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

describe("review fixes — honesty + degenerate geometry", () => {
  const el2 = () => validateChangeset(CS([wall(), level()])).elements;

  it("an unattributed failure under a rejected verdict taints clean elements to recorded, never accepted", () => {
    const e = el2();
    const adj = { verdict: "rejected", ids_source: "project", failures: [{ requirement: "model-level rule" }] };
    const out = attachVerdicts(e, adj);
    for (const x of out) expect(x.verdict.status).toBe("recorded");
    const un = unattributedFailures(e, adj);
    expect(un).toHaveLength(1);
  });

  it("attributed failures still pin their own element; siblings stay accepted when nothing is unattributed", () => {
    const e = el2();
    const adj = { verdict: "rejected", ids_source: "project", failures: [{ element: e[0].validate.identity.GlobalId, requirement: "R" }] };
    const out = attachVerdicts(e, adj);
    expect(out[0].verdict.status).toBe("rejected");
    expect(out[1].verdict.status).toBe("accepted");
    expect(unattributedFailures(e, adj)).toHaveLength(0);
  });

  it("a failure tagged with an UNKNOWN GlobalId counts as unattributed", () => {
    const e = el2();
    const adj = { verdict: "rejected", failures: [{ element: "ghost-id", requirement: "R" }] };
    expect(unattributedFailures(e, adj)).toHaveLength(1);
    expect(attachVerdicts(e, adj)[0].verdict.status).toBe("recorded");
  });

  it("a 200-failure list (cde-store's slice cap) taints a clean sibling to recorded, even fully attributed", () => {
    const e = el2();
    const failures = Array.from({ length: 200 }, (_, i) => ({ element: e[0].validate.identity.GlobalId, requirement: `R${i}` }));
    const adj = { verdict: "rejected", ids_source: "project", failures };
    expect(unattributedFailures(e, adj)).toHaveLength(0); // every failure IS attributed — old code would accept element 1
    const out = attachVerdicts(e, adj);
    expect(out[0].verdict.status).toBe("rejected");
    expect(out[0].verdict.failures).toHaveLength(200);
    expect(out[1].verdict.status).toBe("recorded"); // possibly truncated past the cap — cannot be certified clean
  });

  it("zero-length wall curves and sub-3-distinct-point floor loops are 400s", () => {
    const zero = wall({ place: { ...wall().place, LocationCurve: { start: [1, 2, 3], end: [1, 2, 3] } } });
    expect(() => validateChangeset(CS([zero]))).toThrow(/zero-length/);
    const flat = { kind: "floor", validate: { identity: { Class: "IFCSLAB" } }, place: { LocationLoop: [[0, 0, 0], [0, 0, 0], [5, 5, 0]] } };
    expect(() => validateChangeset(CS([flat]))).toThrow(/DISTINCT/);
  });

  it("non-array psets/quantities are 400s; exactly MAX elements is accepted (boundary)", () => {
    const bad = wall(); bad.validate.psets = "nope";
    expect(() => validateChangeset(CS([bad]))).toThrow(/psets must be an array/);
    const atCap = Array.from({ length: MAX_CHANGESET_ELEMENTS }, () => wall());
    expect(validateChangeset(CS(atCap)).elements).toHaveLength(MAX_CHANGESET_ELEMENTS);
  });
});

// MA-0 Promote walls: retype and attach change an existing wall named by its Revit UniqueId; a create names its type.
describe("validateChangeset — ops, TypeName and exceptions (MA-0)", () => {
  const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8";
  const retype = (over = {}) => ({
    op: "retype", kind: "wall",
    target: { unique_id: UID, type_before: "Generic - 200mm" },
    place: { TypeName: "BDS_EXT_ARC_CMU_200 mm" },
    reason: "DD walls v0: Function Exterior, 200 mm",
    validate: { identity: { Class: "IfcWall", Name: "W 312312" } },
    ...over,
  });
  const attach = (over = {}) => ({
    op: "attach", kind: "wall",
    target: { unique_id: UID },
    place: { BaseLevel: "Level 1", TopLevel: "Level 2" },
    validate: { identity: { Class: "IfcWall", Name: "W 312312" } },
    ...over,
  });

  it("MA-3d: target.ifc_guid is kept on a retype, absent when not sent, refused in words when malformed; carryKey ignores it", () => {
    const G = "2O2Fr$t4X7Zf8NOew3FLKI", one = (el) => validateChangeset(CS([el])).elements[0];
    expect(one(retype({ target: { unique_id: UID, type_before: "Generic - 200mm", ifc_guid: G } })).target).toEqual({ unique_id: UID, type_before: "Generic - 200mm", ifc_guid: G });
    expect("ifc_guid" in one(retype()).target).toBe(false);
    for (const bad of ["abc", 123]) {
      status400(() => one(retype({ target: { unique_id: UID, ifc_guid: bad } })), /^elements\[0\]: target\.ifc_guid must be an IFC GlobalId — 22 characters of its alphabet — when it is sent$/);
    }
    expect(carryKey(retype({ target: { unique_id: UID, ifc_guid: G } }))).toBe(carryKey(retype()));
  });

  it("OPS is create, retype, attach, set_parameter (MA-2c), reshape (MA-5b-4), rehost (MA-5b-5); VOCABULARY is the MA-1 list", () => {
    expect(OPS).toEqual(["create", "retype", "attach", "set_parameter", "reshape", "rehost"]);
    expect(VOCABULARY).toEqual(MA1);
  });

  it("OP_KINDS: create takes the vocabulary, retype and set_parameter six element kinds, attach walls only, rehost doors and windows", () => {
    const SIX = ["wall", "floor", "roof", "ceiling", "door", "window"];
    expect(OP_KINDS).toEqual({ create: VOCABULARY, retype: [...SIX, "column", "beam"], attach: ["wall"], set_parameter: SIX, reshape: ["wall"], rehost: ["door", "window"] });
  });

  it("op defaults to create and is echoed back, with no target, no reason and no exceptions", () => {
    const v = validateChangeset(CS([wall(), level()]));
    for (const e of v.elements) expect(e).toMatchObject({ op: "create", target: null, reason: null });
    expect(v.exceptions).toEqual([]);
  });

  it("an unknown op is a 400 that names the element index and the allowed ops", () => {
    status400(() => validateChangeset(CS([wall(), { ...wall(), op: "delete" }])), /elements\[1\].*"delete".*create, retype, attach/);
  });

  it("retype needs a UniqueId-shaped target and a TypeName, and no LocationCurve", () => {
    const v = validateChangeset(CS([retype()]));
    expect(v.elements[0]).toMatchObject({
      op: "retype", kind: "wall",
      target: { unique_id: UID, type_before: "Generic - 200mm" },
      place: { TypeName: "BDS_EXT_ARC_CMU_200 mm" },
      reason: "DD walls v0: Function Exterior, 200 mm",
    });
    status400(() => validateChangeset(CS([retype({ target: { unique_id: "123456" } })])), /\[0\].*target\.unique_id/);
    status400(() => validateChangeset(CS([retype({ target: undefined })])), /target\.unique_id/);
    status400(() => validateChangeset(CS([retype({ place: { TypeName: "  " } })])), /retype needs place\.TypeName/);
    status400(() => validateChangeset(CS([retype({ place: undefined })])), /retype needs place\.TypeName/);
  });

  it("attach needs two different levels", () => {
    const v = validateChangeset(CS([attach()]));
    expect(v.elements[0]).toMatchObject({ op: "attach", target: { unique_id: UID, type_before: null }, place: { BaseLevel: "Level 1", TopLevel: "Level 2" } });
    status400(() => validateChangeset(CS([attach({ place: { BaseLevel: "Level 1", TopLevel: "Level 1" } })])), /two different levels/);
    status400(() => validateChangeset(CS([attach({ place: { BaseLevel: "Level 1" } })])), /two different levels/);
  });

  it("Promote v1: retype takes floors, roofs, ceilings, doors and windows; a door or window needs place.FamilyName", () => {
    for (const kind of ["floor", "roof", "ceiling"]) {
      const v = validateChangeset(CS([retype({ kind, place: { TypeName: "BDS_INT_STR_CONC_300 mm" } })]));
      expect(v.elements[0]).toMatchObject({ op: "retype", kind, place: { TypeName: "BDS_INT_STR_CONC_300 mm" } });
    }
    for (const kind of ["door", "window"]) {
      status400(() => validateChangeset(CS([retype({ kind, place: { TypeName: "600x1200 mm" } })])), /needs place\.FamilyName/);
      const v = validateChangeset(CS([retype({ kind, place: { TypeName: "600x1200 mm", FamilyName: "BDS_Window_Single Panel" } })]));
      expect(v.elements[0].place).toEqual({ TypeName: "600x1200 mm", FamilyName: "BDS_Window_Single Panel" });
    }
    status400(() => validateChangeset(CS([attach({ kind: "floor" })])), /not supported for attach — allowed: wall/);
    status400(() => validateChangeset(CS([retype({ kind: "level" })])), /not supported for retype — allowed: wall, floor, roof, ceiling, door, window/);
    status400(() => validateChangeset(CS([wall({ kind: "duct" })])), /kind "duct" is not supported — allowed: wall, floor, level, grid, roof, ceiling, door, window, column, furniture/);
  });

  it("the same (op, wall) twice is a 400; a retype plus an attach on one wall is fine", () => {
    expect(validateChangeset(CS([retype(), attach()])).elements.map((e) => e.op)).toEqual(["retype", "attach"]);
    status400(() => validateChangeset(CS([retype(), retype({ target: { unique_id: UID.toUpperCase() } })])), /\[1\].*second retype/);
    status400(() => validateChangeset(CS([attach(), attach()])), /second attach/);
  });

  it("a wall or floor create without a TypeName is a 400; a level or grid needs none", () => {
    const noType = wall(); delete noType.place.TypeName;
    status400(() => validateChangeset(CS([noType])), /wall needs place\.TypeName/);
    status400(() => validateChangeset(CS([wall({ place: { ...wall().place, TypeName: "" } })])), /never takes the model's first type/);
    const floor = { kind: "floor", validate: { identity: { Class: "IFCSLAB" } }, place: { LocationLoop: [[0, 0, 0], [5000, 0, 0], [5000, 5000, 0]] } };
    status400(() => validateChangeset(CS([floor])), /floor needs place\.TypeName/);
    const grid = { kind: "grid", validate: { identity: { Class: "IFCGRID" } }, place: { LocationCurve: { start: [0, 0, 0], end: [0, 9000, 0] } } };
    expect(validateChangeset(CS([level(), grid])).elements).toHaveLength(2);
  });

  it("a reason must be text of at most 500 characters", () => {
    status400(() => validateChangeset(CS([retype({ reason: 42 })])), /reason/);
    status400(() => validateChangeset(CS([retype({ reason: "x".repeat(501) })])), /reason/);
  });

  it("exceptions are kept and checked", () => {
    const rows = [{ unique_id: UID, name: "W 312321", reason: "gap: no BDS type at 125 mm", extra: "dropped" }, { unique_id: "u-2", reason: "in a group" }];
    const v = validateChangeset(CS([attach()], { exceptions: rows }));
    expect(v.exceptions).toEqual([
      { unique_id: UID, name: "W 312321", reason: "gap: no BDS type at 125 mm" },
      { unique_id: "u-2", name: null, reason: "in a group" },
    ]);
    status400(() => validateChangeset(CS([attach()], { exceptions: "nope" })), /exceptions must be an array/);
    status400(() => validateChangeset(CS([attach()], { exceptions: [{ unique_id: UID }] })), /exceptions\[0\].*reason/);
    status400(() => validateChangeset(CS([attach()], { exceptions: [{ reason: "r" }] })), /exceptions\[0\].*unique_id/);
    status400(() => validateChangeset(CS([attach()], { exceptions: [{ unique_id: "x".repeat(65), reason: "r" }] })), /unique_id/);
    status400(() => validateChangeset(CS([attach()], { exceptions: [{ unique_id: UID, reason: "r".repeat(301) }] })), /reason/);
    const many = Array.from({ length: 1001 }, (_, i) => ({ unique_id: `u-${i}`, reason: "r" }));
    status400(() => validateChangeset(CS([attach()], { exceptions: many })), /too many exceptions/);
  });

  it("a posted proposal_guid is replaced by the bridge's own", () => {
    const v = validateChangeset(CS([retype({ proposal_guid: "posted-guid" })]));
    expect(v.elements[0].proposal_guid).not.toBe("posted-guid");
    expect(v.elements[0].proposal_guid).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

// MA-1 placement slice: a roof's or ceiling's outline is one simple closed loop, said in words when it is not.
describe("outlineProblem (MA-1)", () => {
  const square = [[0, 0], [4000, 0], [4000, 4500], [0, 4500]];
  it("passes simple outlines, with or without a closing point", () => {
    expect(outlineProblem(square)).toBeNull();
    expect(outlineProblem([...square, [0, 0]])).toBeNull();
    expect(outlineProblem([[0, 0], [3000, 0], [0, 3000]])).toBeNull();
    expect(outlineProblem([[0, 0], [6000, 0], [6000, 2000], [2000, 2000], [2000, 6000], [0, 6000]])).toBeNull();
  });

  it("passes a 256-point regular polygon, fast", () => {
    const poly = Array.from({ length: 256 }, (_, i) => [5000 * Math.cos((2 * Math.PI * i) / 256), 5000 * Math.sin((2 * Math.PI * i) / 256)]);
    const t = performance.now();
    expect(outlineProblem(poly)).toBeNull();
    expect(performance.now() - t).toBeLessThan(200);
  });

  it("refuses the wrong count or shape of points", () => {
    const many = Array.from({ length: 257 }, (_, i) => [i, i * i]);
    for (const b of [many, [[0, 0], [1, 1]], [[0, 0, 0], [10, 0, 0], [10, 10, 0]], [[0, 0], [NaN, 0], [10, 10]], "x", undefined])
      expect(outlineProblem(b)).toMatch(/3 to 256 finite \[x,y\]/);
    expect(outlineProblem([[0, 0], [10, 0], [0, 0]])).toMatch(/3 points besides a closing one/);
  });

  it("names the edge that is too short, the vertex that doubles back and the edges that cross", () => {
    expect(outlineProblem([[0, 0], [0, 0], [10, 0], [10, 10]])).toMatch(/shorter than 1 mm, Boundary\[0\]→\[1\]/);
    expect(outlineProblem([[0, 0], [0.5, 0], [10, 10]])).toMatch(/shorter than 1 mm, Boundary\[0\]→\[1\]/);
    expect(outlineProblem([[0, 0], [5000, 0], [10000, 0]])).toMatch(/doubles back on itself at Boundary\[0\]/);
    expect(outlineProblem([[0, 0], [10000, 0], [5000, 0], [5000, 5000]])).toMatch(/doubles back on itself at Boundary\[1\]/);
    expect(outlineProblem([[0, 0], [10, 0], [0, 10], [10, 10]])).toMatch(/crosses or touches itself: Boundary\[1\]→\[2\] and \[3\]→\[0\]/);
    expect(outlineProblem([[0, 0], [20, 0], [0, 10], [5, 10]])).toMatch(/crosses or touches itself: Boundary\[1\]→\[2\] and \[3\]→\[0\]/);
    expect(outlineProblem([[0, 0], [20, 0], [20, 10], [10, 0], [0, 10]])).toMatch(/crosses or touches itself: Boundary\[0\]→\[1\] and \[2\]→\[3\]/);
    expect(outlineProblem([[0, 0], [1000, 0], [500, 0.001]])).toMatch(/encloses less than 1 mm²/);
  });
});

describe("validateChangeset — MA-1 creates", () => {
  const make = (kind, Class, Name, base) => (over = {}) => ({ kind, validate: { identity: { Class, Name } }, place: { ...base, ...over } });
  const door = make("door", "IfcDoor", "MA1-D01", { LevelName: "GR-FFL", FamilyName: "M_Single-Flush", TypeName: "MA1 1000 x 2100mm", Location: [8000, 2250, 0], Mark: "MA1-D01" });
  const win = make("window", "IfcWindow", "MA1-W01", { LevelName: "GR-FFL", FamilyName: "M_Fixed", TypeName: "MA1 600 x 1200mm", Location: [24000, 3000, 0], SillHeight: 900, Mark: "MA1-W01" });
  const roof = make("roof", "IfcRoof", "MA1-R01", { LevelName: "MA0 Roof", TypeName: "Generic - 300mm", Boundary: [[0, 0], [12000, 0], [12000, 12000], [0, 12000]], Mark: "MA1-R01" });
  const ceiling = make("ceiling", "IfcCovering", "MA1-C01", { LevelName: "GR-FFL", TypeName: "MA1 Ceiling - 50mm", Boundary: [[0, 0], [4000, 0], [4000, 4500], [0, 4500]], Offset: 2700, Mark: "MA1-C01" });
  const floor = make("floor", "IFCSLAB", "F1", { TypeName: "Generic 150mm", LevelName: "GR-FFL", LocationLoop: [[0, 0, 0], [5000, 0, 0], [5000, 5000, 0]] });
  const grid = make("grid", "IFCGRID", "A", { LocationCurve: { start: [0, 0, 0], end: [0, 9000, 0] } });
  const ok = (el) => validateChangeset(CS([el])).elements[0];

  it("passes each valid door, window, roof and ceiling and keeps its place", () => {
    for (const b of [door, win, roof, ceiling]) {
      const sent = b();
      expect(ok(sent)).toMatchObject({ kind: sent.kind, op: "create", target: null });
      expect(ok(sent).place).toEqual(sent.place);
    }
  });

  it("a door or window needs FamilyName, TypeName, LevelName and a finite [x,y,z] Location", () => {
    for (const b of [door, win]) {
      for (const f of ["FamilyName", "TypeName", "LevelName", "Location"]) status400(() => ok(b({ [f]: undefined })), new RegExp(`needs place\\.${f}`));
      status400(() => ok(b({ Location: [1, 2] })), /needs place\.Location/);
      status400(() => ok(b({ Location: [NaN, 0, 0] })), /needs place\.Location/);
    }
  });

  it("a window's SillHeight is 0 to 100000 mm; a door takes none", () => {
    for (const s of [-1, 100001, "900"]) status400(() => ok(win({ SillHeight: s })), /SillHeight must be a number of mm from 0 to 100000/);
    for (const s of [0, 100000]) expect(ok(win({ SillHeight: s })).place.SillHeight).toBe(s);
    status400(() => ok(door({ SillHeight: 900 })), /a door takes no place\.SillHeight/);
  });

  it("FlipFacing and FlipHand are booleans on doors and windows", () => {
    status400(() => ok(door({ FlipFacing: "yes" })), /place\.FlipFacing must be true or false/);
    for (const b of [door, win]) for (const v of [true, false]) expect(ok(b({ FlipFacing: v, FlipHand: v })).place).toMatchObject({ FlipFacing: v, FlipHand: v });
  });

  it("MA-1b: a door or window may carry a drawn block's Rotation (degrees, 0 up to 360) and Mirrored — never with a flip", () => {
    for (const b of [door, win]) {
      expect(ok(b({ Rotation: 0 })).place.Rotation).toBe(0);
      expect(ok(b({ Rotation: 225.5, Mirrored: true })).place).toMatchObject({ Rotation: 225.5, Mirrored: true });
      for (const r of [-1, 360, "90", NaN, null]) status400(() => ok(b({ Rotation: r })), /place\.Rotation must be a number of degrees from 0 up to \(not including\) 360/);
      status400(() => ok(b({ Rotation: 90, Mirrored: "yes" })), /place\.Mirrored must be true or false/);
      status400(() => ok(b({ Mirrored: true })), /place\.Mirrored needs place\.Rotation/);
      for (const f of ["FlipFacing", "FlipHand"])
        status400(() => ok(b({ Rotation: 90, [f]: false })), /place\.Rotation and place\.FlipFacing or place\.FlipHand say the same thing twice/);
    }
    status400(() => ok(roof({ Rotation: 90 })), /a roof takes no place\.Rotation/);
    status400(() => ok(wall({ place: { ...wall().place, Mirrored: true } })), /a wall takes no place\.Mirrored/);
    const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8";
    status400(() => ok({ op: "retype", kind: "door", target: { unique_id: UID }, place: { FamilyName: "F", TypeName: "T", Rotation: 90 }, validate: { identity: { Class: "IfcDoor", Name: "D" } } }),
      /retype takes no place\.Rotation — only a create sets it/);
    // Item 8's rule holds: both are kept place fields, so neither is listed back as ignored.
    expect(validateChangeset(CS([door({ Rotation: 90, Mirrored: true })])).ignored).toEqual([]);
  });

  it("a field on a kind that does not take it is a 400, never ignored", () => {
    status400(() => ok(roof({ FlipFacing: true })), /a roof takes no place\.FlipFacing/);
    status400(() => ok(roof({ Offset: 0 })), /a roof takes no place\.Offset/);
    status400(() => ok(ceiling({ BaseOffset: 0 })), /a ceiling takes no place\.BaseOffset/);
    status400(() => ok(wall({ place: { ...wall().place, Location: [0, 0, 0] } })), /a wall takes no place\.Location/);
    status400(() => ok(floor({ Boundary: [[0, 0], [1, 0], [1, 1]] })), /a floor takes no place\.Boundary/);
  });

  it("a roof or ceiling needs one simple Boundary", () => {
    for (const b of [roof, ceiling]) {
      status400(() => ok(b({ Boundary: undefined })), /place\.Boundary must be 3 to 256/);
      status400(() => ok(b({ Boundary: [[0, 0], [10, 0], [0, 10], [10, 10]] })), /place\.Boundary crosses or touches itself/);
    }
  });

  it("a ceiling needs its Offset; a roof's BaseOffset is optional", () => {
    status400(() => ok(ceiling({ Offset: undefined })), /a ceiling needs place\.Offset/);
    status400(() => ok(ceiling({ Offset: 1e6 })), /a ceiling needs place\.Offset/);
    expect(ok(roof({ BaseOffset: -300 })).place.BaseOffset).toBe(-300);
    status400(() => ok(roof({ BaseOffset: "0" })), /place\.BaseOffset/);
  });

  it("a roof, ceiling, door or window needs LevelName; a floor still does not", () => {
    for (const b of [roof, ceiling, door, win]) status400(() => ok(b({ LevelName: undefined })), /needs place\.LevelName/);
    expect(ok(floor()).kind).toBe("floor");
  });

  it("Mark rides on every create but a level or grid, as text", () => {
    for (const b of [roof, ceiling, door, win]) expect(ok(b({ Mark: "M-1" })).place.Mark).toBe("M-1");
    expect(ok(floor({ Mark: "M-1" })).place.Mark).toBe("M-1");
    expect(ok(wall({ place: { ...wall().place, Mark: "M-1" } })).place.Mark).toBe("M-1");
    status400(() => ok(level({ place: { BaseElevation: 3000, Mark: "L" } })), /a level takes no place\.Mark/);
    status400(() => ok(grid({ Mark: "A" })), /a grid takes no place\.Mark/);
    for (const m of ["", 5, "x".repeat(257)]) status400(() => ok(door({ Mark: m })), /place\.Mark must be text/);
  });

  it("Structural is a boolean on floors only", () => {
    for (const v of [true, false]) expect(ok(floor({ Structural: v })).place.Structural).toBe(v);
    status400(() => ok(floor({ Structural: "true" })), /place\.Structural must be true or false/);
    status400(() => ok(wall({ place: { ...wall().place, Structural: true } })), /a wall takes no place\.Structural/);
  });

  it("FamilyName names a door's or window's type only — a roof, ceiling, floor or wall create taking one is a 400", () => {
    status400(() => ok(ceiling({ FamilyName: "Compound Ceiling" })), /a ceiling takes no place\.FamilyName/);
    status400(() => ok(roof({ FamilyName: "Sloped Glazing" })), /a roof takes no place\.FamilyName/);
    status400(() => ok(floor({ FamilyName: "Floor" })), /a floor takes no place\.FamilyName/);
    status400(() => ok(wall({ place: { ...wall().place, FamilyName: "Basic Wall" } })), /a wall takes no place\.FamilyName/);
  });

  it("a retype or attach carries none of a create's fields (the add-in reads them typed); a door retype still names its family", () => {
    const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8";
    const retype = (kind, place) => ({ op: "retype", kind, target: { unique_id: UID }, place, validate: { identity: { Class: "IfcDoor", Name: "D" } } });
    const attach = (place) => ({ op: "attach", kind: "wall", target: { unique_id: UID }, place, validate: { identity: { Class: "IfcWall", Name: "W" } } });
    status400(() => ok(retype("door", { FamilyName: "F", TypeName: "T", Mark: 101 })), /retype takes no place\.Mark — only a create sets it/);
    status400(() => ok(retype("door", { FamilyName: "F", TypeName: "T", Location: "garbage" })), /retype takes no place\.Location/);
    status400(() => ok(retype("floor", { TypeName: "T", Structural: "true" })), /retype takes no place\.Structural/);
    status400(() => ok(retype("window", { FamilyName: "F", TypeName: "T", SillHeight: "900" })), /retype takes no place\.SillHeight/);
    status400(() => ok(retype("wall", { TypeName: "T", FamilyName: 5 })), /retype takes no place\.FamilyName/);
    status400(() => ok(attach({ BaseLevel: "L1", TopLevel: "L2", Mark: "W1" })), /attach takes no place\.Mark/);
    expect(ok(retype("door", { FamilyName: "F", TypeName: "T" })).place).toEqual({ FamilyName: "F", TypeName: "T" });
  });
});

// MA-1a step 2: Ghost Builder files its DWG rows as changesets — columns and furniture stand on their level unhosted, and a
// curved DWG wall carries one more point on its arc.
describe("validateChangeset — MA-1a step 2 (Ghost Builder: column, furniture, arc walls)", () => {
  const make = (kind, Class, Name, base) => (over = {}) => ({ kind, validate: { identity: { Class, Name } }, place: { ...base, ...over } });
  const column = make("column", "IfcColumn", "A-COLS #1", { LevelName: "Level 1", FamilyName: "M_Rectangular Column", TypeName: "450 x 600mm", Location: [1000, 2000, 0] });
  const furniture = make("furniture", "IfcFurniture", "A-FURN #1", { LevelName: "Level 1", FamilyName: "M_Desk", TypeName: "1525 x 762mm", Location: [3000, 2000, 0], Mark: "D1" });
  const arc = (mid) => wall({ place: { ...wall().place, LocationCurve: { start: [0, 0, 0], end: [2000, 0, 0], mid } } });
  const ok = (el) => validateChangeset(CS([el])).elements[0];

  it("passes a column and a furniture create and keeps its place", () => {
    for (const b of [column, furniture]) {
      const sent = b();
      expect(ok(sent)).toMatchObject({ kind: sent.kind, op: "create", target: null });
      expect(ok(sent).place).toEqual(sent.place);
    }
  });

  it("a column or furniture needs FamilyName, TypeName, LevelName and a finite [x,y,z] Location", () => {
    for (const b of [column, furniture]) {
      for (const f of ["FamilyName", "TypeName", "LevelName", "Location"]) status400(() => ok(b({ [f]: undefined })), new RegExp(`needs place\\.${f}`));
      status400(() => ok(b({ Location: [1, 2] })), /needs place\.Location, the finite \[x,y,z\] point it stands on/);
    }
  });

  it("a column or furniture takes no sill, flip or outline", () => {
    for (const b of [column, furniture])
      for (const f of ["SillHeight", "FlipFacing", "FlipHand", "Rotation", "Mirrored", "Boundary", "Offset"]) status400(() => ok(b({ [f]: 1 })), new RegExp(`takes no place\\.${f}`));
  });

  it("furniture is create-only; a column retypes (MA-8-7, by section) and then needs its family", () => {
    const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8";
    status400(() => ok({ op: "retype", kind: "column", target: { unique_id: UID }, place: { TypeName: "T" }, validate: { identity: { Class: "IfcColumn", Name: "C" } } }),
      /^elements\[0\]: a column retype needs place\.FamilyName/);
    expect(ok({ op: "retype", kind: "column", target: { unique_id: UID, type_before: "F : T0" }, place: { FamilyName: "F", TypeName: "T" }, validate: { identity: { Class: "IfcColumn", Name: "C" } } }))
      .toMatchObject({ op: "retype", kind: "column", pretick: false, foreign: null, validate: { identity: { Class: "IfcColumn" } } });
    for (const kind of ["furniture"])
      status400(() => ok({ op: "retype", kind, target: { unique_id: UID }, place: { FamilyName: "F", TypeName: "T" }, validate: { identity: { Class: "IfcColumn", Name: "C" } } }),
        new RegExp(`kind "${kind}" is not supported for retype`));
  });

  it("a wall may carry LocationCurve.mid, a finite [x,y,z] on its arc; a grid may not", () => {
    expect(ok(arc([1000, 1000, 0])).place.LocationCurve).toEqual({ start: [0, 0, 0], end: [2000, 0, 0], mid: [1000, 1000, 0] });
    for (const bad of [[1000, 1000], [NaN, 0, 0], "mid"]) status400(() => ok(arc(bad)), /LocationCurve\.mid is a wall's point on its arc/);
    const grid = { kind: "grid", validate: { identity: { Class: "IFCGRID", Name: "A" } }, place: { LocationCurve: { start: [0, 0, 0], end: [0, 9000, 0], mid: [10, 4500, 0] } } };
    status400(() => ok(grid), /LocationCurve\.mid is a wall's point on its arc/);
    // A mid on the chord or on an end is no arc (Arc.Create would throw and decline the whole changeset).
    for (const flat of [[1000, 0, 0], [1000, 0.5, 0], [0, 0, 0], [2000, 0, 0]]) status400(() => ok(arc(flat)), /lies on the line from start to end/);
  });
});

// MA-5b-1: a drawing's labelled room — a point on its level, its name and number; no type, no family, no Mark.
describe("validateChangeset — a room (MA-5b-1)", () => {
  const room = (over = {}) => ({ kind: "room", validate: { identity: { Class: "IFCSPACE", Name: "101", LongName: "OFFICE" } },
    place: { LevelName: "L00", Location: [1000, 2000, 0], Name: "OFFICE", Number: "101", ...over } });
  const ok = (el) => validateChangeset(CS([el])).elements[0];

  it("passes with no type and keeps its name, number and point; the number may be left out", () => {
    expect(ok(room()).place).toEqual({ LevelName: "L00", Location: [1000, 2000, 0], Name: "OFFICE", Number: "101" });
    expect(ok(room()).validate.identity).toMatchObject({ Class: "IFCSPACE", Name: "101", LongName: "OFFICE" });
    expect(ok(room({ Number: undefined })).place.Number).toBeUndefined();
  });

  it("needs its level, its point and its name — each in words", () => {
    status400(() => ok(room({ LevelName: undefined })), /a room needs place\.LevelName — Sentinel never picks its level/);
    for (const bad of [undefined, [1, 2], [NaN, 0, 0]]) status400(() => ok(room({ Location: bad })), /a room needs place\.Location, the finite \[x,y,z\] point inside its walls/);
    for (const bad of [undefined, "", "   ", "OFF\nICE", "x".repeat(257)]) status400(() => ok(room({ Name: bad })), /a room needs place\.Name, its name: one line of at most 256 characters/);
  });

  it("a number is one line of at most 16 characters", () => {
    for (const bad of ["", "1".repeat(17), "10\t1", 101]) status400(() => ok(room({ Number: bad })), /place\.Number must be one line of at most 16 characters/);
  });

  it("takes no family, Mark, sill or flip — and Number rides on no other kind", () => {
    for (const f of ["FamilyName", "Mark", "SillHeight", "FlipFacing", "Rotation", "Boundary"]) status400(() => ok(room({ [f]: "x" })), new RegExp(`a room takes no place\.${f}`));
    status400(() => ok(level({ place: { BaseElevation: 0, Number: "1" } })), /a level takes no place\.Number/);
  });

  it("is create-only", () => {
    status400(() => ok({ op: "retype", kind: "room", target: { unique_id: "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8" }, place: { TypeName: "T" },
      validate: { identity: { Class: "IFCSPACE", Name: "101" } } }), /kind "room" is not supported for retype/);
  });
});

// The body the Revit planner files (PromoteWallsPlanner.Bodies), shared with tools/promote-check: that tool asserts the
// planner still writes exactly this, this asserts the bridge keeps every field of it — neither side drops one silently.
describe("promote-body parity fixture (MA-0)", () => {
  const body = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/promote-body.json", import.meta.url), "utf8"));
  it("passes validateChangeset and keeps op, target, reason, place and exceptions", () => {
    const v = validateChangeset(body);
    expect(v).toMatchObject({ name: body.name, source: "promote" });
    expect(v.elements).toHaveLength(body.elements.length);
    v.elements.forEach((el, i) => {
      const sent = body.elements[i];
      expect(el).toMatchObject({ kind: "wall", op: sent.op, reason: sent.reason, place: sent.place });
      expect(el.target).toEqual({ unique_id: sent.target.unique_id, type_before: sent.target.type_before ?? null });
    });
    expect(v.exceptions).toEqual(body.exceptions);
    expect(new Set(body.elements.map((e) => e.op))).toEqual(new Set(["retype", "attach"]));
  });
});

// Promote v1 (PromotePlanner + Bodies(title: "Promote (DD)")): one storey carrying all six kinds, doors and windows with
// place.FamilyName. tools/promote-check writes the same body; this asserts the bridge keeps every field of it.
describe("promote-body-v1 parity fixture (Promote v1)", () => {
  const body = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/promote-body-v1.json", import.meta.url), "utf8"));
  it("passes validateChangeset and keeps kind, op, target, reason, place (FamilyName too) and exceptions", () => {
    const v = validateChangeset(body);
    expect(v).toMatchObject({ name: body.name, source: "promote" });
    expect(v.elements).toHaveLength(body.elements.length);
    v.elements.forEach((el, i) => {
      const sent = body.elements[i];
      expect(el).toMatchObject({ kind: sent.kind, op: sent.op, reason: sent.reason, place: sent.place });
      expect(el.target).toEqual({ unique_id: sent.target.unique_id, type_before: sent.target.type_before ?? null });
    });
    expect(new Set(body.elements.map((e) => e.kind))).toEqual(new Set(["wall", "floor", "roof", "ceiling", "door", "window"]));
    for (const el of v.elements.filter((e) => e.kind === "door" || e.kind === "window")) expect(el.place.FamilyName).toEqual(expect.any(String));
    expect(v.exceptions).toEqual(body.exceptions);
  });
});

// MA-6-4: the body Shell a Mass files (ShellPlanner.Bodies, a 2-storey L); tools/promote-check writes the same body. Its creates are filed as
// source promote, and none is pre-ticked — pretickOf pre-ticks a Promote retype or attach only, whoever files it.
describe("shell-body parity fixture (MA-6-4)", () => {
  const body = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/shell-body.json", import.meta.url), "utf8"));
  it("passes validateChangeset for a signed-in member, keeps every place field, the facts and the held row, and pre-ticks nothing", () => {
    const v = validateChangeset(body, { member: true });
    expect(v).toMatchObject({ name: body.name, source: "promote", claimed: true });
    expect(v.ignored).toEqual([]);
    expect(v.elements.map((e) => e.kind)).toEqual([...Array(6).fill("wall"), "floor", ...Array(6).fill("wall"), "floor", "roof"]);
    v.elements.forEach((el, i) => {
      const sent = body.elements[i];
      expect(el).toMatchObject({ op: "create", reason: sent.reason, pretick: false, typing: { typed_by: "caller" } });
      expect(el.place).toEqual(sent.place);
      expect(el.facts).toEqual(sent.facts);
      expect(el.validate.identity.Class).toBe(sent.validate.identity.Class);
    });
    // A wall's BaseLevel with its TopLevel: the executor constrains its top there (no TopElevation is sent with it).
    expect(v.elements.filter((e) => e.kind === "wall").every((e) => e.place.BaseLevel && e.place.TopLevel && e.place.TopElevation === undefined)).toBe(true);
    expect(v.exceptions).toEqual(body.exceptions);
  });
});

// MA-1: drill B35's seed as make-concept.py --b35 writes it; tools/promote-check reads the same file into the add-in's DTOs.
describe("b35-seed-body parity fixture (MA-1 placement slice)", () => {
  const body = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/b35-seed-body.json", import.meta.url), "utf8"));
  it("passes validateChangeset and keeps every place field, every Mark, one Structural floor", () => {
    const v = validateChangeset(body);
    expect(v).toMatchObject({ name: "MA1 B35 seed", source: "concept" });
    v.elements.forEach((el, i) => { expect(el.kind).toBe(body.elements[i].kind); expect(el.op).toBe("create"); expect(el.place).toEqual(body.elements[i].place); });
    const n = {}; for (const e of v.elements) n[e.kind] = (n[e.kind] ?? 0) + 1;
    expect(n).toEqual({ floor: 5, roof: 2, ceiling: 3, door: 6, window: 3 });
    expect(v.elements.every((e) => e.place.Mark === e.validate.identity.Name)).toBe(true);
    expect(v.elements.filter((e) => e.place.Structural).map((e) => e.place.Mark)).toEqual(["MA1-L2-F02"]);
  });
});

// MA-1a step 2: the body Ghost Builder files (GhostFiling.Body); tools/promote-check writes the same body and reads it back.
describe("ghost-dwg-body parity fixture (MA-1a step 2)", () => {
  const body = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/ghost-dwg-body.json", import.meta.url), "utf8"));
  it("passes validateChangeset as source dwg and keeps every place field — the arc's mid point, columns and furniture", () => {
    const v = validateChangeset(body);
    expect(v).toMatchObject({ name: body.name, source: "dwg" });
    v.elements.forEach((el, i) => {
      const sent = body.elements[i];
      expect(el).toMatchObject({ kind: sent.kind, op: "create", reason: sent.reason, place: sent.place });
      expect(el.validate.identity).toMatchObject(sent.validate.identity);
    });
    expect(v.elements.map((e) => e.kind)).toEqual(["wall", "wall", "floor", "ceiling", "door", "window", "column", "furniture"]);
    expect(v.elements[1].place.LocationCurve.mid).toEqual([1000, 1000, 0]);
    // MA-1a items 3–4: walls carry no TopElevation (the executor tops them); every element keeps its provenance as filed.
    expect(v.elements.filter((e) => e.kind === "wall").every((e) => e.place.TopElevation === undefined)).toBe(true);
    v.elements.forEach((el, i) => expect(el.provenance).toMatchObject(body.elements[i].provenance));
    expect(v.elements[0].provenance.source_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

// MA-1a item 4: an element's provenance (layer, rule, source file sha) is kept on the changeset as filed — a record. Review
// amendment C1: the Revit stamp takes these facts from its own in-process placer, never from what the bridge returns.
describe("validateChangeset — provenance (MA-1a item 4)", () => {
  const sha = "0123456789abcdef".repeat(4);
  it("keeps an element's layer, rule and source sha as filed, and adds no field when none is sent", () => {
    const v = validateChangeset(CS([wall({ provenance: { layer: "A-WALL-EXT", rule: "type by the guideline", source_sha256: sha } }), wall()]));
    expect(v.elements[0].provenance).toEqual({ layer: "A-WALL-EXT", rule: "type by the guideline", source_sha256: sha });
    expect(v.elements[1]).not.toHaveProperty("provenance");
    expect(validateChangeset(CS([wall({ provenance: { layer: "A-WALL" } })])).elements[0].provenance)
      .toEqual({ layer: "A-WALL", rule: null, source_sha256: null });
  });
  it("refuses a provenance it cannot keep — never drops it silently", () => {
    status400(() => validateChangeset(CS([wall({ provenance: "A-WALL" })])), /provenance must be an object/);
    status400(() => validateChangeset(CS([wall({ provenance: { layer: "A", sha } })])), /provenance takes only layer, rule, source_sha256 \(got sha\)/);
    status400(() => validateChangeset(CS([wall({ provenance: { source_sha256: sha.toUpperCase() } })])), /source_sha256 must be 64 lowercase hex/);
    status400(() => validateChangeset(CS([wall({ provenance: { layer: "x".repeat(257) } })])), /provenance\.layer must be text of at most 256/);
    status400(() => validateChangeset(CS([wall({ provenance: { rule: "" } })])), /provenance\.rule must be text of at most 500/);
  });
  it("C1: each provenance text is one line — a newline, a tab or any other control character is a 400", () => {
    status400(() => validateChangeset(CS([wall({ provenance: { rule: "type by the guideline\nApprover: someone else" } })])), /provenance\.rule must be one line/);
    status400(() => validateChangeset(CS([wall({ provenance: { layer: "A-WALL\r\nLedger row: #1" } })])), /provenance\.layer must be one line/);
    status400(() => validateChangeset(CS([wall({ provenance: { layer: "A\tWALL" } })])), /provenance\.layer must be one line/);
    status400(() => validateChangeset(CS([wall({ provenance: { rule: "a\u0000b" } })])), /provenance\.rule must be one line/);
    status400(() => validateChangeset(CS([wall({ provenance: { source_sha256: sha + "\n" } })])), /source_sha256 must be 64 lowercase hex/);
  });
  it("C1: only a create carries a provenance — on a retype or an attach it is a 400, never kept and never dropped", () => {
    const change = (op, place, over = {}) => ({
      op, kind: "wall", target: { unique_id: "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8" }, place,
      validate: { identity: { Class: "IfcWall", Name: "W 312312" } }, provenance: { layer: "A-WALL" }, ...over,
    });
    status400(() => validateChangeset(CS([change("retype", { TypeName: "BDS_EXT_ARC_CMU_200 mm" })])), /\[0\]: retype takes no provenance — only a create carries one/);
    status400(() => validateChangeset(CS([change("attach", { BaseLevel: "Level 1", TopLevel: "Level 2" })])), /\[0\]: attach takes no provenance — only a create carries one/);
    const v = validateChangeset(CS([change("retype", { TypeName: "BDS_EXT_ARC_CMU_200 mm" }, { provenance: null })]));
    expect(v.elements[0]).not.toHaveProperty("provenance");
  });
});

// MA-1a item 8: contract 2's trust rules — the bridge, not the caller, sets the trust fields, and says what it ignored.
describe("validateChangeset — contract 2's trust rules (MA-1a item 8)", () => {
  const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8";
  const SET = "ignored: set by the bridge";
  const change = (op, place, target = { unique_id: UID }) => ({ op, kind: "wall", target, place, validate: { identity: { Class: "IfcWall", Name: "W 1" } } });

  it("the design's test: an agent post with pretick true and within_tolerance gives a ghost that is not pre-ticked and is not_measured", () => {
    const v = validateChangeset(CS([wall({ pretick: true, accuracy: { status: "within_tolerance" }, measured: { thickness_mm: 203 } })], { source: "agent", contract: 2 }));
    expect(v.elements[0].pretick).toBe(false);
    expect(v.elements[0].accuracy).toEqual({ status: "not_measured" });
    expect(v.elements[0]).not.toHaveProperty("measured");
    expect(v.claimed).toBe(true);
    expect(v.contract).toBe(2);
    expect(v.ignored).toEqual([
      { field: "elements[0].pretick", why: SET },
      { field: "elements[0].accuracy", why: SET },
      { field: "elements[0].measured", why: "ignored: no survey job the bridge ran backs it — accuracy.status is not_measured" },
    ]);
  });

  it("each trust field is ignored and listed back, on the body and on an element", () => {
    const trust = { pretick: true, accuracy: { status: "within_tolerance" }, confidence: 0.99, typing: { by: "rule" }, claimed: false, proposal_guid: "mine", foreign: false };
    const v = validateChangeset(CS([wall(trust)], trust));
    expect(v.ignored).toEqual([
      ...TRUST_FIELDS.map((f) => ({ field: f, why: SET })),
      ...TRUST_FIELDS.map((f) => ({ field: `elements[0].${f}`, why: SET })),
    ]);
    expect(v.claimed).toBe(true);
    expect(v.elements[0]).toMatchObject({ pretick: false, accuracy: { status: "not_measured" } });
    expect(v.elements[0].proposal_guid).not.toBe("mine");
    for (const f of ["confidence", "claimed"]) expect(v.elements[0]).not.toHaveProperty(f);
    // MA-2a: typing is the bridge's own record of who typed the element — the posted one above was ignored.
    expect(v.elements[0].typing).toEqual({ typed_by: "caller" });
  });

  it("a create is never pre-ticked, whatever its source; a Promote attach or a retype with the type the plan saw is — when a signed-in member filed it", () => {
    // Review amendment C2: the store passes { member: true } for a signed-in member; the machine credential earns no pre-tick.
    const MEMBER = { member: true };
    for (const source of ["agent", "dwg", "promote", "sentinel-survey 0.1"])
      expect(validateChangeset(CS([wall()], { source }), MEMBER).elements[0].pretick).toBe(false);
    const ops = [
      change("attach", { BaseLevel: "L1", TopLevel: "L2" }),
      change("retype", { TypeName: "T2" }, { unique_id: UID, type_before: "T1" }),
    ];
    // MA-8-7 (amendment 16): a retype is pre-ticked only when the bridge judged its type a catalogue row; with no catalogue it is unjudged and not
    const CAT = { types: [{ category: "Walls", family: "Basic Wall", type: "T1" }] };
    expect(validateChangeset(CS(ops, { source: "promote" }), MEMBER).elements.map((e) => e.pretick)).toEqual([true, false]);
    expect(validateChangeset(CS(ops, { source: "promote" }), { ...MEMBER, catalog: CAT, sameCategory: core.sameCategory }).elements.map((e) => [e.pretick, e.foreign]))
      .toEqual([[true, undefined], [true, false]]);
    expect(validateChangeset(CS(ops, { source: "promote" })).elements.map((e) => e.pretick)).toEqual([false, false]);
    expect(validateChangeset(CS(ops, { source: { reader: " promote " } })).elements.map((e) => e.pretick)).toEqual([false, false]);
    expect(validateChangeset(CS(ops, { source: "agent" }), MEMBER).elements.map((e) => e.pretick)).toEqual([false, false]);
    expect(validateChangeset(CS([change("retype", { TypeName: "T2" })], { source: "promote" }), MEMBER).elements[0].pretick).toBe(false);
  });

  it("contract 2's source object: the reader is the stored source, a job_id is ignored and listed — a job named in a body backs nothing (MA-4d)", () => {
    const v = validateChangeset(CS([wall()], { source: { reader: "sentinel-survey 0.1", job_id: "job-0042", host: "x" } }));
    expect(v.source).toBe("sentinel-survey 0.1");
    expect(v.claimed).toBe(true);
    expect(v.ignored).toEqual([
      { field: "source.job_id", why: "ignored: a job named in a body backs nothing — the bridge files a survey job's changesets itself (POST /cde/:key/build/jobs/:id/propose); the source is marked claimed" },
      { field: "source.host", why: "ignored: not a field this bridge keeps" },
    ]);
    expect(validateChangeset(CS([wall()], { source: { job_id: "job-1" } })).source).toBe("agent");
  });

  it("a field the bridge does not keep is listed, never dropped silently; a plain changeset has nothing ignored", () => {
    const v = validateChangeset(CS([wall({ lod: 300, won: true })], { conflicts: [] }));
    expect(v.ignored).toEqual([
      { field: "conflicts", why: "ignored: not a field this bridge keeps" },
      { field: "elements[0].lod", why: "ignored: not a field this bridge keeps" },
      { field: "elements[0].won", why: "ignored: not a field this bridge keeps" },
    ]);
    const plain = validateChangeset(CS([wall(), level()], { actor: "a", agent: { kind: "agent" }, exceptions: [] }));
    expect(plain.ignored).toEqual([]);
    expect(plain).not.toHaveProperty("contract");
  });

  it("contract is 1 or 2; the ignored list is capped at 200 entries and says how many more", () => {
    status400(() => validateChangeset(CS([wall()], { contract: 3 })), /contract must be 1 or 2/);
    status400(() => validateChangeset(CS([wall()], { contract: "2" })), /contract must be 1 or 2/);
    expect(validateChangeset(CS([wall()], { contract: 1 })).contract).toBe(1);
    const many = validateChangeset(CS(Array.from({ length: 120 }, () => wall({ pretick: true, confidence: 1 }))));
    expect(many.ignored).toHaveLength(201);
    expect(many.ignored[200]).toEqual({ field: "…", why: "40 more field(s) ignored the same way" });
  });

  it("contract 2's reader id and evidence ids are kept as sent — the caller's claim (review amendment C4)", () => {
    const v = validateChangeset(CS([wall({ cid: " scan-88 ", evidence: ["ev-1", " ev-2 "] }), wall()]));
    expect(v.elements[0]).toMatchObject({ cid: "scan-88", evidence: ["ev-1", "ev-2"] });
    expect(v.elements[1]).not.toHaveProperty("cid");
    expect(v.elements[1]).not.toHaveProperty("evidence");
    expect(v.ignored).toEqual([]);
    status400(() => validateChangeset(CS([wall({ cid: "x".repeat(257) })])), /cid must be one line of text of at most 256 characters/);
    status400(() => validateChangeset(CS([wall({ cid: "a\nb" })])), /cid must be one line of text/);
    status400(() => validateChangeset(CS([wall({ evidence: "ev-1" })])), /evidence must be a list of at most 50/);
    status400(() => validateChangeset(CS([wall({ evidence: Array.from({ length: 51 }, (_, i) => `ev-${i}`) })])), /evidence must be a list of at most 50/);
  });

  it("a trust field nested in place, target, validate or validate.identity is not stored, and is listed (review amendment C3)", () => {
    const NOT_MEASURED = "ignored: no survey job the bridge ran backs it — accuracy.status is not_measured";
    const base = wall();
    const v = validateChangeset(CS([{
      ...base,
      place: { ...base.place, pretick: true, accuracy: { status: "within_tolerance" }, measured: { thickness_mm: 203 }, Colour: "red" },
      validate: { ...base.validate, measured: { thickness_mm: 203 }, identity: { ...base.validate.identity, pretick: true } },
    }]));
    expect(v.elements[0].place).toEqual(base.place);
    expect(v.elements[0].validate).not.toHaveProperty("measured");
    expect(v.elements[0].validate.identity).not.toHaveProperty("pretick");
    expect(v.elements[0].validate.identity).toMatchObject(base.validate.identity);
    expect(v.ignored).toEqual([
      { field: "elements[0].place.pretick", why: SET },
      { field: "elements[0].place.accuracy", why: SET },
      { field: "elements[0].place.measured", why: NOT_MEASURED },
      { field: "elements[0].place.Colour", why: "ignored: not a field this bridge keeps" },
      { field: "elements[0].validate.measured", why: NOT_MEASURED },
      { field: "elements[0].validate.identity.pretick", why: SET },
    ]);
    const t = validateChangeset(CS([change("retype", { TypeName: "T2" }, { unique_id: UID, type_before: "T1", pretick: true })], { source: "promote" }), { member: true });
    expect(t.elements[0].target).toEqual({ unique_id: UID, type_before: "T1" });
    expect(t.ignored).toEqual([{ field: "elements[0].target.pretick", why: SET }]);
  });

  it("review of items 6-8: a field two levels down, in another case, on an exception or in a non-text source is listed, never kept or dropped silently", () => {
    const KEPT = "ignored: not a field this bridge keeps";
    const base = wall();
    const v = validateChangeset(CS([{
      ...base,
      place: { ...base.place, LocationCurve: { ...base.place.LocationCurve, pretick: true, measured: { x: 1 }, bulge: 2 } },
      validate: {
        identity: { ...base.validate.identity, Pretick: true, MEASURED: { x: 1 } },
        psets: [{ name: "Pset_WallCommon", props: { IsExternal: true }, pretick: true }],
        quantities: [{ name: "Qto_WallBaseQuantities", Accuracy: { status: "within_tolerance" } }],
      },
    }], { source: ["promote"], exceptions: [{ unique_id: "u", reason: "r", pretick: true, colour: "red" }] }));
    expect(v.source).toBe("agent");
    expect(v.elements[0].place.LocationCurve).toEqual(base.place.LocationCurve);
    expect(v.elements[0].validate.identity).toEqual({ ...base.validate.identity, GlobalId: v.elements[0].proposal_guid });
    expect(v.elements[0].validate.psets).toEqual([{ name: "Pset_WallCommon", props: { IsExternal: true } }]);
    expect(v.elements[0].validate.quantities).toEqual([{ name: "Qto_WallBaseQuantities" }]);
    expect(v.exceptions).toEqual([{ unique_id: "u", name: null, reason: "r" }]);
    expect(v.ignored).toEqual([
      { field: "source", why: KEPT },
      { field: "elements[0].place.LocationCurve.pretick", why: SET },
      { field: "elements[0].place.LocationCurve.measured", why: "ignored: no survey job the bridge ran backs it — accuracy.status is not_measured" },
      { field: "elements[0].place.LocationCurve.bulge", why: KEPT },
      { field: "elements[0].validate.identity.Pretick", why: SET },
      { field: "elements[0].validate.identity.MEASURED", why: "ignored: no survey job the bridge ran backs it — accuracy.status is not_measured" },
      { field: "elements[0].validate.psets[0].pretick", why: SET },
      { field: "elements[0].validate.quantities[0].Accuracy", why: SET },
      { field: "exceptions[0].pretick", why: SET },
      { field: "exceptions[0].colour", why: KEPT },
    ]);
    expect(validateChangeset(CS([wall()], { source: 5 })).ignored).toEqual([{ field: "source", why: KEPT }]);
    expect(validateChangeset(CS([wall()], { source: "  " })).ignored).toEqual([]);
    // An arc wall keeps its mid: the curve is rebuilt from start, end and mid.
    const arc = { ...base, place: { ...base.place, LocationCurve: { start: [0, 0, 0], end: [4000, 0, 0], mid: [2000, 500, 0] } } };
    expect(validateChangeset(CS([arc])).elements[0].place.LocationCurve).toEqual(arc.place.LocationCurve);
  });

  it("review of items 6-8: a listed field name is one line of at most 200 characters", () => {
    const v = validateChangeset(CS([wall({ ["x".repeat(100000)]: 1, ["a\nb\tc"]: 1 })]));
    expect(v.ignored.map((i) => i.field)).toEqual([("elements[0]." + "x".repeat(100000)).slice(0, 200), "elements[0].a b c"]);
  });

  it("the shared fixture: a contract-2 post is stored as the add-in reads it (tools/promote-check reads the same file)", () => {
    const fx = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/contract2-trust.json", import.meta.url), "utf8"));
    const v = validateChangeset(fx.posted);
    expect(v).toMatchObject(fx.stored);
    expect(v.elements[0].place).not.toHaveProperty("pretick");
  });

  it("the add-in's sources are named, so the MCP tool can refuse to file as one", () => {
    expect(ADDIN_SOURCES).toEqual(["dwg", "promote", "photo"]); // MA-6-6: Photo Massing's
    expect(TRUST_FIELDS).toEqual(["pretick", "accuracy", "confidence", "typing", "claimed", "proposal_guid", "foreign"]);
  });
});

describe("validateChangeset — a wall or floor names its level (drill MA2a, F-MA2a-3)", () => {
  // Live: the design's contract-2 wall (BaseLevel GR-FFL, TopLevel 01-FFL, no LevelName) was stored, and the executor — which read
  // only LevelName for a create — put it on the model's lowest level (GR_SSL, 300 mm high), in silence.
  const bare = (kind, place) => ({ kind, validate: { identity: { Class: kind === "wall" ? "IfcWall" : "IfcSlab", Name: "X" } }, place });
  const curve = { start: [0, 0, 0], end: [5000, 0, 0] }, loop = [[0, 0, 0], [5000, 0, 0], [5000, 5000, 0]];
  it("a wall or floor that names no level at all is a 400 in words", () => {
    status400(() => validateChangeset(CS([bare("wall", { TypeName: "Generic - 200mm", LocationCurve: curve })])),
      /elements\[0\]: a wall needs place\.LevelName or place\.BaseLevel \(or place\.BaseElevation\) — Sentinel never picks its level/);
    status400(() => validateChangeset(CS([bare("floor", { TypeName: "Generic 150mm", LocationLoop: loop })])),
      /elements\[0\]: a floor needs place\.LevelName \(or place\.BaseElevation\) — Sentinel never picks its level/);
  });
  it("contract 2's BaseLevel names a wall's level; TopLevel its top", () => {
    const el = validateChangeset(CS([bare("wall", { TypeName: "Generic - 200mm", LocationCurve: curve, BaseLevel: "GR-FFL", TopLevel: "01-FFL" })])).elements[0];
    expect(el.place).toMatchObject({ BaseLevel: "GR-FFL", TopLevel: "01-FFL" });
    expect(validateChangeset(CS([bare("wall", { TypeName: "Generic - 200mm", LocationCurve: curve, LevelName: "GR-FFL" })])).elements).toHaveLength(1);
    expect(validateChangeset(CS([bare("wall", { TypeName: "Generic - 200mm", LocationCurve: curve, BaseElevation: 0 })])).elements).toHaveLength(1);
  });
  it("two names for one end are refused, never chosen between", () => {
    status400(() => validateChangeset(CS([bare("wall", { TypeName: "Generic - 200mm", LocationCurve: curve, LevelName: "GR-FFL", BaseLevel: "01-FFL" })])),
      /place\.LevelName and place\.BaseLevel name different levels/);
    status400(() => validateChangeset(CS([bare("wall", { TypeName: "Generic - 200mm", LocationCurve: curve, BaseLevel: "GR-FFL", TopLevel: "01-FFL", TopElevation: 6000 })])),
      /place\.TopLevel and place\.TopElevation say the same thing twice/);
    status400(() => validateChangeset(CS([bare("wall", { TypeName: "Generic - 200mm", LocationCurve: curve, BaseLevel: "GR-FFL", TopLevel: "GR-FFL" })])),
      /place\.TopLevel is the wall's own base level/);
    status400(() => validateChangeset(CS([bare("wall", { TypeName: "Generic - 200mm", LocationCurve: curve, BaseLevel: 7 })])), /place\.BaseLevel must be text/);
  });
});

describe("validateChangeset — bridge typing (MA-2a, full contract 2)", () => {
  const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8";
  // A typer as changesets-store builds one (changesets-typing makeTyper): here a stand-in that types by thickness alone.
  const typer = (kind, facts, at) => {
    if (!facts?.thickness_mm) throw Object.assign(new Error(`${at}: a ${kind} without place.TypeName is typed by the bridge — no thickness was sent`), { status: 400 });
    return { TypeName: `T${facts.thickness_mm}`, FamilyName: "Basic Wall", typing: { typed_by: "bridge", type: `T${facts.thickness_mm}`, family: "Basic Wall" } };
  };
  const untyped = (over = {}) => { const w = wall(over); delete w.place.TypeName; return w; };
  const FACTS = { thickness_mm: 200, params: { Function: "Exterior", Location: "Exterior" } };
  const retype = (place, facts, uid = UID) => ({ op: "retype", kind: "wall", target: { unique_id: uid, type_before: "T1" }, ...(facts ? { facts } : {}), place, validate: { identity: { Class: "IfcWall", Name: "W 1" } } });

  it("without a typer a create or retype without place.TypeName is the 400 it was", () => {
    status400(() => validateChangeset(CS([untyped({ facts: FACTS })])), /a wall needs place\.TypeName — Sentinel never takes the model's first type/);
    status400(() => validateChangeset(CS([retype({}, FACTS)])), /retype needs place\.TypeName/);
  });

  it("with a typer, a create without TypeName is typed: place.TypeName filled, typing says the bridge did it, the facts kept, no pre-tick, nothing ignored", () => {
    const v = validateChangeset(CS([untyped({ facts: FACTS })]), { type: typer });
    expect(v.elements[0].place.TypeName).toBe("T200");
    expect(v.elements[0].place).not.toHaveProperty("FamilyName"); // a wall takes no FamilyName
    expect(v.elements[0].typing).toEqual({ typed_by: "bridge", type: "T200", family: "Basic Wall" });
    expect(v.elements[0].facts).toEqual(FACTS);
    expect(v.elements[0].pretick).toBe(false);
    expect(v.ignored).toEqual([]);
  });

  it("an element that names its TypeName is the caller's: the typer is not asked, typing says so, facts ride along as a record", () => {
    const asked = [];
    const v = validateChangeset(CS([wall({ facts: FACTS })]), { type: (...a) => { asked.push(a); return typer(...a); } });
    expect(asked).toEqual([]);
    expect(v.elements[0]).toMatchObject({ place: { TypeName: "Generic - 200mm" }, typing: { typed_by: "caller" }, facts: FACTS });
    expect(validateChangeset(CS([wall()]), { type: typer }).elements[0]).not.toHaveProperty("facts");
  });

  it("the typer's refusal is the reply, with the element's index", () => {
    status400(() => validateChangeset(CS([wall(), untyped({ facts: { params: { Location: "Exterior" } } })]), { type: typer }),
      /^elements\[1\]: a wall without place\.TypeName is typed by the bridge — no thickness was sent$/);
  });

  // MA-6-3 review fix: one that names another family is refused (the stored pair is the `typing` record's), not kept.
  it("a door typed by the bridge takes the rule's FamilyName too (a type name alone is not one type); one that names another family is a 400", () => {
    const door = (place) => ({ kind: "door", facts: { thickness_mm: 1 }, place: { LevelName: "L1", Location: [1, 2, 0], ...place }, validate: { identity: { Class: "IfcDoor", Name: "D" } } });
    const v = validateChangeset(CS([door({}), door({ FamilyName: "basic wall" })]), { type: typer });
    expect(v.elements[0].place).toMatchObject({ TypeName: "T1", FamilyName: "Basic Wall" });
    expect(v.elements[1].place).toMatchObject({ TypeName: "T1", FamilyName: "Basic Wall" });
    status400(() => validateChangeset(CS([door({ FamilyName: "Mine" })]), { type: typer }), /^elements\[0\]: the bridge types the family too \(Basic Wall, not Mine\)/);
    status400(() => validateChangeset(CS([{ ...door({}), place: { Location: [1, 2, 0] } }]), { type: typer }), /a door needs place\.LevelName/); // the other checks still run
  });

  it("a retype without TypeName is typed from its facts, and is never pre-ticked for that — even a signed-in Promote's", () => {
    const v = validateChangeset(CS([retype({}, FACTS), retype({ TypeName: "T2" }, null, UID.replace(/f8$/, "f9"))], { source: "promote" }),
      { member: true, type: typer, catalog: { types: [{ category: "Walls", family: "Basic Wall", type: "T1" }] }, sameCategory: core.sameCategory });
    expect(v.elements[0]).toMatchObject({ place: { TypeName: "T200" }, typing: { typed_by: "bridge" }, pretick: false });
    expect(v.elements[1]).toMatchObject({ place: { TypeName: "T2" }, typing: { typed_by: "caller" }, pretick: true });
  });

  it("facts: the shape is checked, an attach takes none, and a stray key is a 400 — never dropped silently", () => {
    status400(() => validateChangeset(CS([wall({ facts: { thickness_mm: 200, measured: true } })])), /facts takes only thickness_mm and params \(got measured\)/);
    status400(() => validateChangeset(CS([wall({ facts: { thickness_mm: "200" } })])), /facts\.thickness_mm must be a number of mm above 0 and at most 10000/);
    status400(() => validateChangeset(CS([wall({ facts: { params: { Location: 7 } } })])), /facts\.params\.Location must be one line of text of at most 256 characters/);
    status400(() => validateChangeset(CS([{ op: "attach", kind: "wall", target: { unique_id: UID }, facts: FACTS, place: { BaseLevel: "L1", TopLevel: "L2" }, validate: { identity: { Class: "IfcWall" } } }])),
      /attach takes no facts — nothing is typed/);
    expect(validateChangeset(CS([wall({ facts: {} })])).elements[0].facts).toEqual({});
  });

  it("a posted typing is ignored and listed (set by the bridge), whichever way the element was typed", () => {
    const v = validateChangeset(CS([untyped({ facts: FACTS, typing: { typed_by: "me" } }), wall({ typing: { typed_by: "me" } })]), { type: typer });
    expect(v.ignored).toEqual([{ field: "elements[0].typing", why: "ignored: set by the bridge" }, { field: "elements[1].typing", why: "ignored: set by the bridge" }]);
    expect(v.elements.map((e) => e.typing.typed_by)).toEqual(["bridge", "caller"]);
  });

  it("the shared fixture: the design's contract-2 body, typed by the real resolver, is stored as the add-in reads it (tools/promote-check reads the same file)", () => {
    const fx = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/contract2-typed-body.json", import.meta.url), "utf8"));
    const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
    const standards = {
      guideline: { body: read("../../demo/bds-pilot/bds-dd-layerfree-guideline.json"), label: "guideline@1 · office · 0123456789ab…", sha256: "ab".repeat(32) },
      catalog: { body: read("../../demo/bds-pilot/bds-type-catalog.json"), label: "type_catalog@1 · office · fedcba987654…", sha256: "cd".repeat(32) },
    };
    const v = validateChangeset(fx.posted, { type: makeTyper(standards, core) });
    expect(v).toMatchObject(fx.stored);
    expect(v.elements[0].typing.rule).toMatch(/^DD \(MA-2a\): an outside wall/);
    expect(v.elements[1].typing.rule).toMatch(/^DD \(MA-2a\): an inside wall/);
    for (const e of v.elements) expect(e.typing).toMatchObject({ guideline_sha256: "ab".repeat(32), catalog_sha256: "cd".repeat(32) });
    // The body as the design wrote it — a `measured` block and no facts — is still refused, in words: 203 mm is a gap under the exact rule.
    const design = { ...fx.posted, elements: [{ ...fx.posted.elements[0], facts: undefined, measured: { thickness_mm: 203, height_mm: 3050 } }] };
    status400(() => validateChangeset(design, { type: makeTyper(standards, core) }), /no rule of guideline@1 · office · 0123456789ab… matches a wall with no facts/);
  });
});

// MA-2c: set_parameter writes one value on an existing TYPE from a cited source — [BP] P2-7's item, built once. The bridge checks
// the source (cite, changesets-typing.makeCiter over the project's catalogue and ids@n) and writes its own record; it is never
// pre-ticked. The fixture is the body the add-in's PropertyPlanner files (tools/promote-check writes the same).
describe("validateChangeset — set_parameter (MA-2c)", () => {
  const TYPE_UID = "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-00000a01";
  const VS = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/value-sources.json", import.meta.url), "utf8"));
  const cite = makeCiter({
    catalog: { body: VS.catalog, label: "type_catalog@1 · office · fedcba987654…", sha256: "cd".repeat(32) },
    ids: { body: VS.ids, label: "ids@1 · project · 0a1b2c3d4e5f…", sha256: "ef".repeat(32) },
  }, core);
  const write = (over = {}) => ({
    op: "set_parameter", kind: "wall", target: { unique_id: TYPE_UID }, place: { TypeName: "BDS_EXT_ARC_CMU_200 mm" },
    parameter: "Pset_WallCommon.FireRating", revit_parameter: "Fire Rating", from: "", to: "60 min", value_source: { kind: "catalogue" },
    reason: "DD walls: from the catalogue", validate: { identity: { Class: "IfcWall", Name: "type BDS_EXT_ARC_CMU_200 mm" } },
    ...over,
  });

  it("keeps the parameter, from, to and the bridge's own value_source; a member's Promote post still never pre-ticks it", () => {
    const v = validateChangeset(CS([write()], { source: "promote" }), { member: true, cite });
    expect(v.elements[0]).toMatchObject({
      op: "set_parameter", kind: "wall", target: { unique_id: TYPE_UID, type_before: null }, place: { TypeName: "BDS_EXT_ARC_CMU_200 mm" },
      parameter: "Pset_WallCommon.FireRating", revit_parameter: "Fire Rating", from: "", to: "60 min", pretick: false,
      value_source: { kind: "catalogue", ref: "type_catalog@1 · office · fedcba987654… · BDS_EXT_ARC_CMU_200 mm · Fire Rating", sha256: "cd".repeat(32) },
    });
    expect(v.ignored).toEqual([]);
  });

  it("MA-3d: a set_parameter keeps target.ifc_guid", () => {
    const G = "2O2Fr$t4X7Zf8NOew3FLKI";
    expect(validateChangeset(CS([write({ target: { unique_id: TYPE_UID, ifc_guid: G } })]), { cite }).elements[0].target).toEqual({ unique_id: TYPE_UID, type_before: null, ifc_guid: G });
  });

  it("a posted value_source.ref is not kept (the bridge writes the record) and is listed; a door's clause source cites its sentence", () => {
    const v = validateChangeset(CS([write({ value_source: { kind: "catalogue", ref: "trust me" } }),
      write({ kind: "door", place: { FamilyName: "BDS_INT_1 PNL", TypeName: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" }, parameter: "Pset_DoorCommon.FireRating", to: "FD30", value_source: { kind: "clause" },
        validate: { identity: { Class: "IfcDoor", Name: "type BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm" } } })]), { cite });
    expect(v.ignored).toEqual([{ field: "elements[0].value_source.ref", why: "ignored: not a field this bridge keeps" }]);
    expect(v.elements[1].value_source.ref).toBe('ids@1 · project · 0a1b2c3d4e5f… · Doors carry FD30 · "All doors shall be FD30."');
  });

  it("each refusal says what is missing: the type, the family, the parameter, from, to, the source — and a source the bridge cannot check", () => {
    status400(() => validateChangeset(CS([write({ place: {} })]), { cite }), /^elements\[0\]: set_parameter needs place\.TypeName — the type whose parameter it writes$/);
    status400(() => validateChangeset(CS([write({ kind: "door", place: { TypeName: "T" } })]), { cite }), /a door set_parameter needs place\.FamilyName/);
    status400(() => validateChangeset(CS([write({ parameter: "FireRating" })]), { cite }), /set_parameter needs parameter, a "Pset_Name\.Property" key/);
    status400(() => validateChangeset(CS([write({ parameter: "Pset_DoorCommon.FireRating" })]), { cite }), /^elements\[0\]: a wall set_parameter writes Pset_WallCommon, not Pset_DoorCommon\.FireRating$/); // C1
    status400(() => validateChangeset(CS([write({ from: undefined })]), { cite }), /set_parameter needs from — the value the plan read, "" when empty \(the stale guard compares it\)/);
    status400(() => validateChangeset(CS([write({ to: " " })]), { cite }), /set_parameter needs to — one line of at most 500 characters/);
    status400(() => validateChangeset(CS([write({ to: "60\nmin" })]), { cite }), /set_parameter needs to/);
    // C1: a filled value is a person's, whatever the source says — the bridge refuses it, not only the add-in's planner.
    status400(() => validateChangeset(CS([write({ from: "30 min" })]), { cite }), /^elements\[0\]: set_parameter fills an empty value only — a filled one is a person's \(P2-7 edits it\)$/);
    status400(() => validateChangeset(CS([write({ value_source: { kind: "person" } })]), { cite }),
      /set_parameter needs value_source \{kind: catalogue \| clause\} — a value is written from a cited source, never a guess; a person types their own in Revit/);
    status400(() => validateChangeset(CS([write()])), /the bridge read no standards to check this value_source — nothing is written unchecked/);
    status400(() => validateChangeset(CS([write({ to: "120 min" })]), { cite }), /gives BDS_EXT_ARC_CMU_200 mm Fire Rating "60 min", not "120 min"/);
    status400(() => validateChangeset(CS([write({ target: { unique_id: TYPE_UID, type_before: "X" } })]), { cite }), /set_parameter takes no target\.type_before — its stale guard is from/);
    status400(() => validateChangeset(CS([write({ facts: { thickness_mm: 200 } })]), { cite }), /set_parameter takes no facts — nothing is typed/);
    status400(() => validateChangeset(CS([write({ place: { TypeName: "BDS_EXT_ARC_CMU_200 mm", Mark: "W1" } })]), { cite }), /set_parameter takes no place\.Mark — only a create sets it/);
  });

  it("the referee judges the value written: the bridge builds a set_parameter's validate from its kind, parameter and to; a posted pset, quantity or other class is listed, never judged (review amendment C2)", () => {
    const v = validateChangeset(CS([write({ validate: { identity: { Class: "IfcBuildingElementProxy", Name: "type X" },
      psets: [{ name: "Pset_WallCommon", rows: [{ name: "FireRating", value: "REI120" }] }], quantities: [] } })]), { cite });
    expect(v.elements[0].validate).toMatchObject({ identity: { Class: "IFCWALL", Name: "type X" },
      psets: [{ name: "Pset_WallCommon", rows: [{ name: "FireRating", value: "60 min" }] }], quantities: [] });
    expect(v.ignored).toEqual([
      { field: "elements[0].validate.psets", why: "ignored: set by the bridge from parameter and to" },
      { field: "elements[0].validate.quantities", why: "ignored: set by the bridge from parameter and to" },
      { field: "elements[0].validate.identity.Class", why: "ignored: set by the bridge from kind" }]);
    expect(validateChangeset(CS([write()]), { cite }).elements[0].validate.identity.Class).toBe("IfcWall"); // the kind's class, as the add-in posts it, is kept
  });

  it("one set_parameter per type and parameter; another op carrying a set_parameter's fields is refused, never dropped", () => {
    status400(() => validateChangeset(CS([write(), write()]), { cite }), /elements\[1\]: a second set_parameter for the same element and Pset_WallCommon\.FireRating/);
    status400(() => validateChangeset(CS([{ ...wall(), to: "60 min" }])), /^elements\[0\]: create takes no to — only a set_parameter writes a value$/);
    status400(() => validateChangeset(CS([{ op: "attach", kind: "wall", target: { unique_id: TYPE_UID }, place: { BaseLevel: "L1", TopLevel: "L2" },
      validate: { identity: { Class: "IfcWall" } }, parameter: "Pset_WallCommon.FireRating" }])), /attach takes no parameter/);
  });

  it("the shared fixture: the add-in's body passes, every write field kept, each source the bridge's record (tools/promote-check writes the same body)", () => {
    const body = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/set-parameter-body.json", import.meta.url), "utf8"));
    const v = validateChangeset(body, { member: true, cite });
    expect(v).toMatchObject({ name: body.name, source: "promote" });
    v.elements.forEach((el, i) => {
      const sent = body.elements[i];
      expect(el).toMatchObject({ kind: sent.kind, op: sent.op, reason: sent.reason, place: sent.place });
      if (sent.op === "set_parameter") {
        expect(el).toMatchObject({ parameter: sent.parameter, revit_parameter: sent.revit_parameter, from: sent.from, to: sent.to, pretick: false });
        expect(el.value_source.kind).toBe(sent.value_source.kind);
        const [pset, prop] = sent.parameter.split("."); // C2: the bridge's own validate, from parameter and to
        expect(el.validate.psets).toEqual([{ name: pset, rows: [{ name: prop, value: sent.to }] }]);
      }
    });
    // C8: retypes first within a chunk (ByWall), the type edits after — the executor runs them after the attach loop either way.
    expect(body.elements.map((e) => e.op)).toEqual(["retype", "retype", "set_parameter", "set_parameter"]);
    expect(v.ignored).toEqual([]); // the add-in sends nothing the bridge sets itself
    expect(v.exceptions).toEqual(body.exceptions);
  });
});

// MA-6-1: the bridge owns the IFC class — set from the kind on every op (amendment 2: an exact compare, so no subtype steps outside a spec).
describe("validateChangeset — the class is the bridge's, from the kind (MA-6-1)", () => {
  const CLASS = { field: "elements[0].validate.identity.Class", why: "ignored: set by the bridge from kind" };
  const cls = (el) => validateChangeset(CS([el]));

  it("a wall claiming IFCDOOR reads IFCWALL, and the claim is listed back", () => {
    const v = cls(wall({ validate: { identity: { Class: "IFCDOOR", Name: "W1" } } }));
    expect(v.elements[0].validate.identity.Class).toBe("IFCWALL");
    expect(v.ignored).toEqual([CLASS]);
  });

  it("a subtype is not the kind's class: IfcWallStandardCase reads IFCWALL, listed", () => {
    const v = cls(wall({ validate: { identity: { Class: "IfcWallStandardCase", Name: "W1" } } }));
    expect(v.elements[0].validate.identity.Class).toBe("IFCWALL");
    expect(v.ignored).toEqual([CLASS]);
  });

  it("the kind's own class in any case is kept as sent, with nothing listed", () => {
    const v = cls(wall({ validate: { identity: { Class: "IfcWall", Name: "W1" } } }));
    expect(v.elements[0].validate.identity.Class).toBe("IfcWall");
    expect(v.ignored).toEqual([]);
  });

  it("a kind outside the Promote six takes its own class: a level, a column, furniture (as GhostFiling sends it)", () => {
    const v = cls(level({ validate: { identity: { Class: "IFCWALL", Name: "L2" } } }));
    expect(v.elements[0].validate.identity.Class).toBe("IFCBUILDINGSTOREY");
    expect(v.ignored).toEqual([CLASS]);
    const point = (kind, Class) => ({ kind, validate: { identity: { Class } }, place: { FamilyName: "F", TypeName: "T", LevelName: "Level 1", Location: [0, 0, 0] } });
    expect(cls(point("column", "IFCWALL")).elements[0].validate.identity.Class).toBe("IFCCOLUMN");
    expect(cls(point("furniture", "IFCFURNISHINGELEMENT")).elements[0].validate.identity.Class).toBe("IFCFURNITURE");
    expect(cls(point("furniture", "IFCFURNITURE")).ignored).toEqual([]);
  });

  it("every op, not only a create: a retype of a wall claiming IFCDOOR reads IFCWALL", () => {
    const v = cls({ op: "retype", kind: "wall", target: { unique_id: "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8" }, place: { TypeName: "T" },
      validate: { identity: { Class: "IFCDOOR" } } });
    expect(v.elements[0].validate.identity.Class).toBe("IFCWALL");
    expect(v.ignored).toEqual([CLASS]);
  });

  it("a class is still required: an older poster's missing class is a 400, never filled in", () => {
    status400(() => cls(wall({ validate: { identity: { Name: "W1" } } })), /validate\.identity\.Class is required \(send the kind's IFC class, e\.g\. IFCWALL; the bridge sets it from the kind\)/);
  });

  // Review fix: the override fails closed, so a kind added to OP_KINDS (6-3's opening and beam, 6-6's mass) cannot ship without a class.
  it("every kind any op takes has its IFC class", () => {
    for (const k of new Set(Object.values(OP_KINDS).flat())) expect(CREATE_ENTITY[k], k).toMatch(/^IFC[A-Z]+$/);
  });
});

// MA-6-3 (vocabulary v2): an opening (a rectangle in a wall, or a hole in a floor), a beam, a roof's Slopes per edge, a column's TopLevel.
describe("validateChangeset — vocabulary v2 (MA-6-3)", () => {
  const fx = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/vocab-v2-body.json", import.meta.url), "utf8"));
  const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
  const G = read("../../demo/bds-pilot/bds-dd-layerfree-guideline.json");
  const type = makeTyper({
    guideline: { body: { ...G, elements: [...G.elements, fx.beam_rule] }, label: "guideline@1 · office · 0123456789ab…", sha256: "ab".repeat(32) },
    catalog: { body: read("../../demo/bds-pilot/bds-type-catalog.json"), label: "type_catalog@1 · office · fedcba987654…", sha256: "cd".repeat(32) },
  }, core);
  // The fixture's element i, its place merged with `place` (a key set to undefined is removed).
  const sent = (i, place = {}) => {
    const el = structuredClone(fx.posted.elements[i]);
    el.place = { ...el.place, ...place };
    for (const k of Object.keys(place)) if (place[k] === undefined) delete el.place[k];
    return el;
  };
  const [wallOpening, floorOpening, column, beam, , roof] = [0, 1, 2, 3, 4, 5].map((i) => (place) => sent(i, place));
  const ok = (el) => validateChangeset(CS([el])).elements[0];

  it("the fixture's storey is stored with its v2 fields, the bridge types the beam sent with facts, and nothing is ignored", () => {
    const v = validateChangeset(fx.posted, { type });
    expect(v.ignored).toEqual([]);
    expect(v.elements.map((e) => [e.kind, e.validate.identity.Class])).toEqual([["opening", "IFCOPENINGELEMENT"], ["opening", "IFCOPENINGELEMENT"],
      ["column", "IFCCOLUMN"], ["beam", "IFCBEAM"], ["beam", "IFCBEAM"], ["roof", "IFCROOF"]]);
    for (const i of [0, 1, 2, 3, 5]) expect(v.elements[i].place, String(i)).toEqual(fx.posted.elements[i].place);
    expect(v.elements[4].place).toEqual({ ...fx.posted.elements[4].place, FamilyName: "BDS_STR_CONC_Rectangular Beam", TypeName: "BDS_INT_STR_CONC_300 x 600 mm" });
    expect(v.elements[4].typing).toMatchObject({ typed_by: "bridge", family: "BDS_STR_CONC_Rectangular Beam", type: "BDS_INT_STR_CONC_300 x 600 mm" });
    expect(v.elements[4].pretick).toBe(false);
    expect(v.elements[0].typing).toEqual({ typed_by: "caller" }); // an opening is never typed: no typer is asked for it
    expect(validateChangeset(CS([wallOpening(), floorOpening()])).elements).toHaveLength(2);
  });

  it("an opening is exactly one shape: both, or neither, is a 400 in words", () => {
    const both = /an opening is a rectangle in a wall \(place\.Location, Width, Height and SillHeight\) or a hole in a floor \(place\.Boundary\) — send exactly one of the two/;
    status400(() => ok(wallOpening({ Boundary: [[0, 0], [1000, 0], [1000, 1000]] })), both);
    status400(() => ok(floorOpening({ Location: [0, 0, 0] })), both);
    status400(() => ok(wallOpening({ Location: undefined })), both);
  });

  it("a wall opening needs its point, its Width and Height (above 50, at most 20000 mm) and its SillHeight (0 to 20000 mm)", () => {
    status400(() => ok(wallOpening({ Location: [1, 2] })), /a wall opening needs place\.Location, the finite \[x,y,z\] point at its middle on its host wall's location line/);
    for (const f of ["Width", "Height"])
      for (const bad of [undefined, 50, 20001, "900", NaN]) status400(() => ok(wallOpening({ [f]: bad })), new RegExp(`a wall opening needs place\\.${f}, a number of mm above 50 and at most 20000`));
    for (const bad of [undefined, -1, 20001, "0"]) status400(() => ok(wallOpening({ SillHeight: bad })), /a wall opening needs place\.SillHeight, its bottom above its level — a number of mm from 0 to 20000/);
    expect(ok(wallOpening({ Width: 20000, Height: 50.5, SillHeight: 20000 })).place).toMatchObject({ Width: 20000, Height: 50.5, SillHeight: 20000 });
  });

  it("a floor opening is its Boundary — one simple outline, and no Width, Height or SillHeight", () => {
    status400(() => ok(floorOpening({ Boundary: [[0, 0], [10, 0], [0, 10], [10, 10]] })), /opening place\.Boundary crosses or touches itself/);
    for (const f of ["Width", "Height", "SillHeight"]) status400(() => ok(floorOpening({ [f]: 900 })), new RegExp(`a floor opening is its place\\.Boundary — it takes no place\\.${f}`));
  });

  it("an opening and a beam name their level; an opening takes no family, Mark or TopLevel; Width and Height are an opening's only", () => {
    for (const b of [wallOpening, floorOpening, beam]) status400(() => ok(b({ LevelName: undefined })), /needs place\.LevelName — Sentinel never picks its level/);
    status400(() => ok(wallOpening({ LevelName: undefined })), /: an opening needs place\.LevelName/); // review fix: "an", not "a"
    status400(() => ok(wallOpening({ FamilyName: "F" })), /: an opening takes no place\.FamilyName/);
    status400(() => ok(wallOpening({ Mark: "O1" })), /: an opening takes no place\.Mark/);
    status400(() => ok(floorOpening({ TopLevel: "H L3" })), /: an opening takes no place\.TopLevel/);
    // Review fix: an opening is untyped — a TypeName would be shown to the reviewer and never applied.
    for (const o of [wallOpening, floorOpening]) status400(() => ok(o({ TypeName: "Generic - 200mm" })), /an opening takes no place\.TypeName — it is its shape/);
    status400(() => ok(roof({ Width: 900 })), /a roof takes no place\.Width/);
    status400(() => ok(beam({ Height: 600 })), /a beam takes no place\.Height/);
    status400(() => ok(wall({ place: { ...wall().place, SillHeight: 0 } })), /a wall takes no place\.SillHeight/);
  });

  it("a beam is one straight LocationCurve with its family and type (or facts the bridge types it from)", () => {
    status400(() => ok(beam({ LocationCurve: undefined })), /beam needs place\.LocationCurve with finite \[x,y,z\] start and end/);
    status400(() => ok(beam({ LocationCurve: { start: [0, 0, 3000], end: [0, 0, 3000] } })), /beam LocationCurve start and end are identical/);
    // Review fix: a vertical or sub-millimetre beam is Revit's refusal at Apply — the whole storey declined for good.
    for (const end of [[0, 0, 6000], [0.5, 0.5, 3000]])
      status400(() => ok(beam({ LocationCurve: { start: [0, 0, 3000], end } })), /a beam runs in plan — its LocationCurve start and end at least 1 mm apart in x,y/);
    expect(ok(beam({ LocationCurve: { start: [0, 0, 3000], end: [1, 0, 3500] } })).place.LocationCurve.end).toEqual([1, 0, 3500]);
    status400(() => ok(beam({ LocationCurve: { start: [0, 0, 3000], end: [6000, 0, 3000], mid: [3000, 1000, 3000] } })), /place\.LocationCurve\.mid is a wall's point on its arc/);
    status400(() => ok(beam({ FamilyName: undefined })), /a beam needs place\.FamilyName — a type name alone is not one type/);
    status400(() => ok(beam({ TypeName: undefined })), /a beam needs place\.TypeName — Sentinel never takes the model's first type/);
    status400(() => ok(beam({ Location: [0, 0, 0] })), /a beam takes no place\.Location/);
    expect(ok(beam()).place.Mark).toBe("B1");
  });

  // Review fix: the stored family-and-type pair is the `typing` record's — a posted family the rule did not choose is refused in words.
  it("a beam typed from facts takes the rule's family: another posted family is a 400, the rule's own in any case is stored in its spelling", () => {
    status400(() => validateChangeset(CS([sent(4, { FamilyName: "M_Concrete-Rectangular Beam" })]), { type }),
      /the bridge types the family too \(BDS_STR_CONC_Rectangular Beam, not M_Concrete-Rectangular Beam\) — leave place\.FamilyName out, or send place\.TypeName/);
    const v = validateChangeset(CS([sent(4, { FamilyName: " bds_str_conc_rectangular beam " })]), { type }).elements[0];
    expect(v.place).toMatchObject({ FamilyName: "BDS_STR_CONC_Rectangular Beam", TypeName: "BDS_INT_STR_CONC_300 x 600 mm" });
    expect(v.typing).toMatchObject({ typed_by: "bridge", family: "BDS_STR_CONC_Rectangular Beam" });
  });

  it("a roof's Slopes has one entry per Boundary edge — a closing point is no edge — each null or degrees above 0 and at most 75", () => {
    status400(() => ok(roof({ Slopes: [30, null, 30, null, null] })), /place\.Slopes needs one entry per Boundary edge \(4 here; Slopes\[i\] is Boundary\[i\]→\[i\+1\]\)/);
    status400(() => ok(roof({ Slopes: "30" })), /place\.Slopes needs one entry per Boundary edge/);
    for (const bad of [0, -5, 75.1, "30", NaN]) status400(() => ok(roof({ Slopes: [bad, null, 30, null] })), /place\.Slopes\[0\] must be null \(the edge defines no slope\) or degrees above 0 and at most 75/);
    expect(ok(roof({ Boundary: [[0, 0], [8000, 0], [8000, 6000], [0, 6000]], Slopes: [75, null, 0.5, null] })).place.Slopes).toEqual([75, null, 0.5, null]);
    expect(ok(roof({ Slopes: undefined })).place).not.toHaveProperty("Slopes"); // flat, as before
    const ceiling = { kind: "ceiling", validate: { identity: { Class: "IfcCovering", Name: "C" } }, place: { LevelName: "H L1", TypeName: "T", Boundary: [[0, 0], [1, 0], [1, 1]], Offset: 2700, Slopes: [null, null, null] } };
    status400(() => ok(ceiling), /a ceiling takes no place\.Slopes/);
  });

  it("TopLevel (amendment 3): a column's is text and not its own level; on a door or a beam it is a 400; a wall's and a floor's as before; an attach still validates", () => {
    status400(() => ok(column({ TopLevel: 2 })), /place\.TopLevel must be text of at most 256 characters — the level the column's top reaches/);
    status400(() => ok(column({ TopLevel: " h l1 " })), /place\.TopLevel is the column's own level — name the level its top reaches/);
    status400(() => ok(beam({ TopLevel: "H L3" })), /a beam takes no place\.TopLevel/);
    const door = { kind: "door", validate: { identity: { Class: "IFCDOOR", Name: "D" } }, place: { LevelName: "H L1", FamilyName: "F", TypeName: "T", Location: [0, 0, 0], TopLevel: "H L2" } };
    status400(() => ok(door), /a door takes no place\.TopLevel/);
    expect(ok(column()).place.TopLevel).toBe("H L2");
    const floor = { kind: "floor", validate: { identity: { Class: "IFCSLAB", Name: "F" } }, place: { TypeName: "T", LevelName: "H L1", TopLevel: "H L2", LocationLoop: [[0, 0, 0], [1, 0, 0], [1, 1, 0]] } };
    expect(ok(floor).place.TopLevel).toBe("H L2");
    const attach = { op: "attach", kind: "wall", target: { unique_id: "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8" }, place: { BaseLevel: "H L1", TopLevel: "H L2" }, validate: { identity: { Class: "IFCWALL", Name: "W" } } };
    expect(ok(attach).place).toEqual({ BaseLevel: "H L1", TopLevel: "H L2" });
  });

  it("Width, Height and Slopes ride on no retype (only a create sets them); a beam is create-only", () => {
    const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8";
    const retype = (place) => ({ op: "retype", kind: "roof", target: { unique_id: UID }, place: { TypeName: "T", ...place }, validate: { identity: { Class: "IFCROOF", Name: "R" } } });
    for (const f of ["Width", "Height", "Slopes"]) status400(() => ok(retype({ [f]: [1] })), new RegExp(`retype takes no place\\.${f} — only a create sets it`));
    status400(() => ok({ ...beam(), op: "retype", target: { unique_id: UID }, place: { TypeName: "T" } }), /^elements\[0\]: a beam retype needs place\.FamilyName/); // MA-8-7: a beam retypes now (by section)
  });

  // Risk R14: a place field the bridge keeps that the add-in's PlaceDto does not read would be stored, and dropped in Revit unread.
  it("PLACE_KEPT is the add-in's PlaceDto, name for name (ChangesetClient.cs)", () => {
    const cs = readFileSync(new URL("../../SentinelAddin/Coordination/ChangesetClient.cs", import.meta.url), "utf8");
    const from = cs.indexOf("public sealed class PlaceDto");
    const names = [...cs.slice(from, cs.indexOf("\n}", from)).matchAll(/\[JsonPropertyName\("([^"]+)"\)\]/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(20);
    expect([...names].sort()).toEqual([...PLACE_KEPT].sort());
  });
});

// MA-6-6 (MAS-2): a mass — a footprint between two elevations (the Level.Elevation frame), untyped, levelless; Photo Massing files it as "photo".
describe("validateChangeset — mass (MA-6-6)", () => {
  const mass = (place = {}, over = {}) => {
    const el = { kind: "mass", validate: { identity: { Class: "IFCBUILDINGELEMENTPROXY", Name: "Photo mass" } },
      place: { Boundary: [[-6000, -4000], [6000, -4000], [6000, 4000], [-6000, 4000]], BaseElevation: 0, TopElevation: 9600, ...place }, ...over };
    for (const k of Object.keys(place)) if (place[k] === undefined) delete el.place[k];
    return el;
  };
  const ok = (el) => validateChangeset(CS([el])).elements[0];

  it("is stored with its Boundary and elevations, untyped, as the bridge's IFCBUILDINGELEMENTPROXY — a posted IFCMASS is replaced and listed", () => {
    const v = validateChangeset(CS([mass({}, { validate: { identity: { Class: "IFCMASS", Name: "Photo mass" } } })]));
    expect(v.elements[0]).toMatchObject({ kind: "mass", op: "create", place: mass().place, typing: { typed_by: "caller" }, pretick: false });
    expect(v.elements[0].validate.identity.Class).toBe("IFCBUILDINGELEMENTPROXY");
    expect(v.ignored).toEqual([{ field: "elements[0].validate.identity.Class", why: "ignored: set by the bridge from kind" }]);
    expect(CREATE_ENTITY.mass).toBe("IFCBUILDINGELEMENTPROXY");
  });

  it("400s in words: no Boundary, a non-finite elevation, top at or below base, less than 100 mm high, a TypeName, a Slopes, a LevelName (amendment 14)", () => {
    status400(() => ok(mass({ Boundary: undefined })), /mass place\.Boundary must be 3 to 256 finite \[x,y\] points/);
    status400(() => ok(mass({ Boundary: [[0, 0], [10, 0], [0, 10], [10, 10]] })), /mass place\.Boundary crosses or touches itself/);
    for (const f of ["BaseElevation", "TopElevation"])
      for (const bad of [undefined, "0", NaN]) status400(() => ok(mass({ [f]: bad })), new RegExp(`a mass needs place\\.${f}, a finite number of mm`));
    for (const [b, t] of [[3000, 3000], [3000, 0], [0, 99.9]])
      status400(() => ok(mass({ BaseElevation: b, TopElevation: t })), /a mass's place\.TopElevation is 100 to 1000000 mm above its place\.BaseElevation/);
    status400(() => ok(mass({ TopElevation: 1000001 })), /\(got 1000001 mm\)/);
    expect(ok(mass({ BaseElevation: -100, TopElevation: 0 })).place).toMatchObject({ BaseElevation: -100, TopElevation: 0 });
    status400(() => ok(mass({ TypeName: "Generic - 200mm" })), /: a mass takes no place\.TypeName — it is its shape/);
    status400(() => ok(mass({ Slopes: [null, null, null, null] })), /: a mass takes no place\.Slopes/);
    status400(() => ok(mass({ LevelName: "Massing L00" })), /: a mass takes no place\.LevelName — the shell gives each storey its level/);
    status400(() => ok(mass({ Mark: "M1" })), /: a mass takes no place\.Mark/);
    status400(() => ok(mass({ TopLevel: "L2" })), /: a mass takes no place\.TopLevel/);
    // MA-6-6 review fix: every other kept key a mass never reads is refused too — never kept unapplied, never a curve the add-in cannot read
    for (const [f, v] of [["BaseLevel", "L9"], ["Name", "12-storey tower"], ["LocationCurve", 5], ["LocationLoop", "x"]])
      status400(() => ok(mass({ [f]: v })), new RegExp(`: a mass takes no place\\.${f} — it is its Boundary between BaseElevation and TopElevation`));
    status400(() => ok(mass({ LevelName: "L1", BaseLevel: "L1" })), /place\.LevelName — the shell gives each storey its level/); // LevelName's words first
  });

  it("a photo body is the add-in's claim: filed by a member with pretick: true, every element still comes back unticked", () => {
    const lvl = level({ validate: { identity: { Class: "IFCBUILDINGSTOREY", Name: "Massing L01" } }, place: { BaseElevation: 3200 } });
    const v = validateChangeset(CS([lvl, mass()], { source: "photo", pretick: true }), { member: true });
    expect(v.source).toBe("photo");
    expect(v.claimed).toBe(true);
    expect(v.elements.map((e) => e.pretick)).toEqual([false, false]);
    expect(validateChangeset(CS([{ ...mass(), pretick: true }], { source: "photo" }), { member: true }).elements[0].pretick).toBe(false);
  });
});

// MA-5b-4 (C13b): a placed wall moved to where a revised drawing draws it — the bridge's only, its stale guard where the wall was placed
describe("validateChangeset — reshape (MA-5b-4)", () => {
  const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8";
  const R = (over = {}, place = {}) => ({ op: "reshape", kind: "wall", cid: "drawing-ev-0008-p1-wall-4", validate: { identity: { Class: "IFCWALL", Name: "drawing-ev-0008-p1-wall-4" } },
    target: { unique_id: UID, placed: { start: [47850, 0, 0], end: [47850, 6000, 0] } }, place: { LocationCurve: { start: [47950, 0, 0], end: [47950, 6000, 0] }, ...place }, ...over });
  const TRUST = { measured: { thickness_mm: 300 }, pretick: false, accuracy: { status: "inferred", basis: "drawing" } };
  const JOB = { record: { id: "job-0006", ledger_id: 3002 }, byCid: new Map([["drawing-ev-0008-p1-wall-4", TRUST]]) };
  const ok = (el) => validateChangeset({ name: "Drawing job-0006", contract: 2, elements: [el] }, { member: true, job: JOB }).elements[0];

  it("from a job: kept with its placed line as the stale guard, never pre-ticked", () => {
    expect(ok(R())).toMatchObject({ op: "reshape", kind: "wall", target: { unique_id: UID, type_before: null, placed: { start: [47850, 0, 0], end: [47850, 6000, 0] } },
      place: { LocationCurve: { start: [47950, 0, 0], end: [47950, 6000, 0] } }, pretick: false });
    expect(OP_KINDS.reshape).toEqual(["wall"]);
  });
  it("posted in a body it is refused — only the bridge builds one", () => {
    status400(() => validateChangeset({ name: "x", elements: [R()] }, { member: true }), /a reshape is the bridge's — it is proposed from a revised drawing \(revises\), never posted/);
  });
  it("needs a straight new line, the placed line, and keeps the type", () => {
    status400(() => ok(R({}, { LocationCurve: { start: [1, 2, 0], end: [1, 2, 0] } })), /reshape needs place\.LocationCurve, a straight finite \[x,y,z\] start and end apart/);
    status400(() => ok(R({}, { LocationCurve: { start: [0, 0, 0], end: [10, 0, 0], mid: [5, 3, 0] } })), /a straight finite/);
    status400(() => ok(R({ target: { unique_id: UID } })), /reshape needs target\.placed \{start, end\}/);
    status400(() => ok(R({}, { TypeName: "T" })), /reshape keeps the wall's type — a retype is its own ghost/);
    status400(() => ok(R({ target: { unique_id: UID, type_before: "X", placed: { start: [0, 0, 0], end: [1, 0, 0] } } })), /reshape takes no target\.type_before/);
    status400(() => ok(R({ kind: "door" })), /kind "door" is not supported for reshape/);
  });
});

// MA-5b-5: a door or window no wall hosts, replaced by the office's wall-hosted type in its wall — the first op that removes an element
describe("validateChangeset — rehost (MA-5b-5)", () => {
  const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f9", UID2 = "5a1c2b3d-1111-2222-3333-444455556666-0004c3fa";
  const H = (over = {}, place = {}) => ({ op: "rehost", kind: "door", validate: { identity: { Class: "IFCDOOR", Name: "Door 4711" } },
    target: { unique_id: UID, type_before: "Placeholder Door : 1000 x 2100", at: [44100, 2500, 6000] },
    place: { LevelName: "L01", Location: [44050, 2500, 6000], FamilyName: "BDS_INT_1 PNL", TypeName: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", ...place }, ...over });
  const ok = (els, member = true) => validateChangeset({ name: "Promote · L01", source: "promote", elements: Array.isArray(els) ? els : [els] }, { member });

  it("a member's: kept with its stale guard (type_before, at) and its place; never pre-ticked, never typed", () => {
    const e = ok(H()).elements[0];
    expect(e).toMatchObject({ op: "rehost", kind: "door", target: { unique_id: UID, type_before: "Placeholder Door : 1000 x 2100", at: [44100, 2500, 6000] },
      place: { LevelName: "L01", Location: [44050, 2500, 6000], FamilyName: "BDS_INT_1 PNL", TypeName: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" },
      pretick: false, typing: { typed_by: "caller" } });
    expect(ok(H({ kind: "window", validate: { identity: { Class: "IFCWINDOW", Name: "W1" } } }, { SillHeight: 900 })).elements[0].place.SillHeight).toBe(900);
  });
  it("the machine credential files none — a rehost removes an element", () => {
    status400(() => ok(H(), false), /a rehost removes an element — only a signed-in member files one/);
  });
  it("needs its stale guard and its whole place; takes no other place field; a sill is a window's", () => {
    status400(() => ok(H({ target: { unique_id: UID, at: [0, 0, 0] } })), /rehost needs target\.type_before/);
    status400(() => ok(H({ target: { unique_id: UID, type_before: "A : B" } })), /rehost needs target\.at \[x,y,z\]/);
    status400(() => ok(H({}, { Location: [1, 2] })), /rehost needs place\.LevelName, place\.Location \[x,y,z\]/);
    status400(() => ok(H({ place: { LevelName: "L01", Location: [0, 0, 0], FamilyName: "F" } })), /and place\.FamilyName and place\.TypeName/);
    for (const f of ["Mark", "FlipFacing", "Rotation", "LocationCurve"])
      status400(() => ok(H({}, { [f]: f === "Mark" ? "D1" : f === "FlipFacing" ? true : f === "Rotation" ? 90 : { start: [0, 0, 0], end: [1, 0, 0] } })), new RegExp(`rehost takes no place\\.${f}`));
    status400(() => ok(H({}, { SillHeight: 900 })), /place\.SillHeight is a window's/);
    // review: a window rehost carries its sill
    status400(() => ok(H({ kind: "window", validate: { identity: { Class: "IFCWINDOW", Name: "W1" } } })), /a window rehost needs place\.SillHeight/);
    status400(() => ok(H({ kind: "wall" })), /kind "wall" is not supported for rehost/);
  });
  it("a rehost's element carries no other ghost; one rehost per element", () => {
    const retype = { op: "retype", kind: "door", target: { unique_id: UID, type_before: "Placeholder Door : 1000 x 2100" }, validate: { identity: { Class: "IFCDOOR", Name: "D" } },
      place: { FamilyName: "BDS_INT_1 PNL", TypeName: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" } };
    status400(() => ok([H(), retype]), /a rehost replaces its element — it carries no other ghost/);
    status400(() => ok([retype, H()]), /a rehost replaces its element — it carries no other ghost/);
    status400(() => ok([H(), H()]), /a second rehost for the same element/);
    expect(ok([H(), H({ target: { unique_id: UID2, type_before: "P : Q", at: [1, 2, 3] } })]).elements).toHaveLength(2);
  });
  it("target.at rides on a rehost only — listed as not kept on any other op", () => {
    const v = validateChangeset({ name: "x", elements: [{ op: "retype", kind: "door", target: { unique_id: UID, type_before: "A : B", at: [0, 0, 0] },
      validate: { identity: { Class: "IFCDOOR", Name: "D" } }, place: { FamilyName: "F", TypeName: "T" } }] }, { member: true });
    expect(v.elements[0].target.at).toBeUndefined();
    expect(v.ignored.map((x) => x.field)).toContain("elements[0].target.at");
  });
  it("carryKey: the same element, read where it stood, at the same point, as the same type and sill", () => {
    const a = ok(H()).elements[0];
    expect(carryKey(a)).toBe(carryKey(ok(H()).elements[0]));
    expect(carryKey(a)).not.toBe(carryKey(ok(H({}, { Location: [44050, 2600, 6000] })).elements[0]));
    expect(carryKey(a)).not.toBe(carryKey(ok(H({ target: { unique_id: UID, type_before: "Placeholder Door : 1000 x 2100", at: [44100, 2400, 6000] } })).elements[0]));
    expect(carryKey(a)).not.toBe(carryKey(ok(H({}, { TypeName: "BDS_INT_1 PNL_WOOD_900 x 2100 mm" })).elements[0]));
  });
});

describe("validateChangeset — a changeset the bridge built from a survey job (MA-4d)", () => {
  const W = { op: "create", kind: "wall", cid: "scan-L00-wall-1", evidence: ["ev-0001#slice-L00"], validate: { identity: { Class: "IFCWALL", Name: "scan-L00-wall-1" } },
    place: { TypeName: "BDS_EXT_ARC_CMU_300 mm", LevelName: "GR-FFL", LocationCurve: { start: [40125, 150, 0], end: [47850, 150, 0] }, TopElevation: 2800 } };
  const TRUST = { measured: { length_mm: 8001, height_mm: 2800, thickness_mm: 300 }, pretick: true, trim_mm: [-140, -136],
    accuracy: { status: "within_tolerance", basis: "fit", from_job: "job-0002", fit_rmse_mm: 2, coverage: 1, target_mm: 20 } };
  const JOB = { record: { id: "job-0002", ledger_id: 2201 }, byCid: new Map([["scan-L00-wall-1", TRUST]]) };
  it("takes measured, the trims, the accuracy and the pre-tick from the bridge's record; the changeset is not claimed and names its job", () => {
    const v = validateChangeset({ name: "Survey job-0002 · GR-FFL", source: "sentinel-survey 0.1.0", contract: 2, elements: [W] }, { member: true, job: JOB });
    expect(v).toMatchObject({ claimed: false, job: JOB.record, ignored: [] });
    expect(v.elements[0]).toMatchObject({ measured: TRUST.measured, trim_mm: [-140, -136], accuracy: TRUST.accuracy, pretick: true });
  });
  it("an element that is no candidate of the job is refused (the bridge's own guard)", () => {
    status400(() => validateChangeset({ name: "x", elements: [{ ...W, cid: "scan-L09-wall-1" }] }, { job: JOB }), /scan-L09-wall-1 is not a candidate of job-0002/);
  });
  it("a body cannot reach it: a posted job, source.job_id, measured or pretick is listed; the changeset stays claimed; nothing is measured", () => {
    const v = validateChangeset({ name: "x", source: { reader: "sentinel-survey 0.1", job_id: "job-0002" }, job: JOB.record,
      elements: [{ ...W, measured: TRUST.measured, pretick: true }] }, { member: true });
    expect(v).toMatchObject({ claimed: true, source: "sentinel-survey 0.1" });
    expect(v).not.toHaveProperty("job");
    expect(v.elements[0]).toMatchObject({ pretick: false, accuracy: { status: "not_measured" } });
    expect(v.elements[0]).not.toHaveProperty("measured");
    expect(v.ignored.map((i) => i.field)).toEqual(["job", "source.job_id", "elements[0].measured", "elements[0].pretick"]);
  });
});

describe("editCost (MA-8-1)", () => {
  const els = (n) => Array.from({ length: n }, (_, i) => ({ proposal_guid: `g${i}` }));
  const cs = (id, over = {}) => ({ id, name: id, status: "applied", elements: els(5), job: { id: "job-0001", ledger_id: 40 },
    result: { applied: ap(["g0", "g1", "g2"]), rejected: ["g3", "g4"], declined_on_web: [{ proposal_guid: "g3" }], reported_at: "2026-10-12T10:00:00Z" }, ...over });
  const ap = (gs) => gs.map((g, i) => ({ proposal_guid: g, revit_element_id: i + 1, revit_unique_id: `u${i}` })); // the shape the bridge stores
  const rev = (id, entity_id, op, guids) => ({ id, entity_id, new_value: { op, guids } });

  it("keeps web, carried and Revit declines apart; carried is left out of the share", () => {
    const c = cs("a", { result: { applied: ap(["g0", "g1"]), rejected: ["g2", "g3", "g4"],
      declined_on_web: [{ proposal_guid: "g2" }, { proposal_guid: "g3", carried_from: "x" }], reported_at: "t" } });
    const [r] = editCost([c], []).runs;
    expect(r).toMatchObject({ filed: 5, web: 1, carried: 1, revit: 1, applied: 2, undone: 0, kept: 2, pending: 0, complete: true, ceiling: EDIT_COST_CEILING });
    expect(r.share_changed).toBeCloseTo(2 / 4);
  });

  it("undo then redo is kept; two undos count once; the newest row decides", () => {
    const rows = [rev(1, "a", "undo", ["g0", "g1"]), rev(2, "a", "redo", ["g0"]), rev(3, "a", "undo", ["g1"])];
    const [r] = editCost([cs("a")], rows).runs;
    expect(r.undone).toBe(1);
    expect(r.kept).toBe(2);
    expect(r.rests_on).toEqual({ applied: "2026-10-12T10:00:00Z", reverted: 3 });
  });

  it("a proposed changeset is pending (run not complete); withdrawn is left out and counted; filed 0 has no share", () => {
    const out = editCost([cs("a"), cs("b", { status: "proposed", result: undefined }), cs("w", { status: "withdrawn" })], []);
    expect(out.withdrawn).toBe(1);
    expect(out.runs[0]).toMatchObject({ pending: 5, complete: false, changesets: ["a", "b"] });
    expect(editCost([cs("z", { elements: [], result: { applied: [], rejected: [] } })], []).runs[0].share_changed).toBeNull();
  });

  it("a withdrawn changeset is said on its run (ghosts), and a run of only withdrawn ones still shows", () => {
    const out = editCost([cs("a"), cs("w", { status: "withdrawn" })], []);
    expect(out.runs[0]).toMatchObject({ filed: 5, withdrawn: 5 });
    const only = editCost([cs("w", { status: "withdrawn" })], []);
    expect(only.runs).toHaveLength(1);
    expect(only.runs[0]).toMatchObject({ filed: 0, withdrawn: 5, share_changed: null });
  });

  it("groups by the job's ledger row, not its id; a changeset without a job is its own run", () => {
    const out = editCost([cs("a"), cs("b"), cs("c", { job: { id: "job-0001", ledger_id: 99 } }), cs("d", { job: undefined, name: "Promote DD" })], []);
    expect(out.runs.map((r) => r.run)).toEqual(["job#40", "job#99", "d"]);
    expect(out.runs[0]).toMatchObject({ filed: 10, label: "job-0001 (ledger #40)" });
    expect(out.runs[2].label).toBe("Promote DD");
  });
});

// MA-8-9 — a stair flag: an exception row with kind "stair", checked by checkStairFlag (the pick route's body is the same three fields).
describe("stair flags (MA-8-9)", () => {
  const CASES = JSON.parse(readFileSync(new URL("./fixtures/stair-flag/cases.json", import.meta.url), "utf8"));
  const BOX = { min: [0, 0, 0], max: [1200, 5400, 3000] };
  const GID = "0abcdefghijklmnopqrstu";
  const row = (over = {}) => ({ unique_id: `stair:${GID}`, name: `Stair ${GID}`, reason: "a stair", kind: "stair", storey: "L01", box: BOX, ...over });
  const trust = { measured: { m: 1 }, pretick: false, accuracy: { status: "inferred", basis: "ifc", from_job: "job-0007" } };
  const IFC = { record: { id: "job-0007", reader: "sentinel-ifc 0.2.0" }, byCid: new Map([["c1", trust]]) };
  const W1 = () => wall({ cid: "c1" });

  it("the fields", () => expect(STAIR_FLAG_FIELDS).toEqual(["unique_id", "name", "reason", "kind", "storey", "box", "source", "global_id"]));
  for (const c of CASES.good) it(`good: ${c.name}`, () => expect(checkStairFlag(c.body, "x")).toEqual(c.kept));
  for (const c of CASES.refused) it(`refused: ${c.name}`, () => {
    try { checkStairFlag(c.body, "x"); throw new Error("no throw"); } catch (e) { expect([e.status, e.message]).toEqual([400, c.message]); }
  });
  it("a row in a posted body is kept with source posted; its global_id and a posted source are listed, not kept", () => {
    const v = validateChangeset(CS([wall()], { exceptions: [row({ unique_id: "s1", source: "ifc", global_id: GID })] }));
    expect(v.exceptions).toEqual([{ unique_id: "s1", name: `Stair ${GID}`, reason: "a stair", kind: "stair", storey: "L01", box: BOX, source: "posted" }]);
    expect(v.ignored).toEqual(expect.arrayContaining([{ field: "exceptions[0].source", why: "ignored: set by the bridge" }, { field: "exceptions[0].global_id", why: expect.stringMatching(/^ignored/) }]));
  });
  it("from an IFC job the source is ifc and a 22-character GlobalId is kept; another job's flag is a 400", () => {
    const v = validateChangeset(CS([W1()], { exceptions: [row({ global_id: GID }), row({ unique_id: "stair:#9", global_id: "#9" })] }), { job: IFC });
    expect(v.exceptions.map((x) => [x.source, x.global_id ?? null])).toEqual([["ifc", GID], ["ifc", null]]);
    status400(() => validateChangeset(CS([W1()], { exceptions: [row({ unique_id: "s1" })] }), { job: { record: { id: "job-1", reader: "sentinel-survey 0.6.0" }, byCid: IFC.byCid } }), /exceptions\[0\]: a stair flag comes from an IFC job or a person's pick/);
  });
  it("an unknown kind is a 400 in words; a row without kind is as before (source stays not kept)", () => {
    // review: only kind "stair" is a flag; any other kind is listed as not kept, as before the slice
    const ramp = validateChangeset(CS([wall()], { exceptions: [{ unique_id: "u", reason: "r", kind: "ramp" }, { unique_id: "u2", reason: "r", kind: null }] }));
    expect(ramp.exceptions.map((x) => x.kind)).toEqual([undefined, undefined]);
    expect(ramp.ignored.map((i) => i.field)).toEqual(["exceptions[0].kind", "exceptions[1].kind"]);
    // review: "stair:…" ids are the bridge's own (an IFC job's flag or a person's pick) - a posted row cannot wear one
    status400(() => validateChangeset(CS([wall()], { exceptions: [row({ unique_id: "stair:pick-1a2b3c4d" })] })), /exceptions\[0\]: unique_id "stair:…" is the bridge's own/);
    status400(() => validateChangeset(CS([wall()], { exceptions: [{ unique_id: "stair:x", reason: "r" }] })), /unique_id "stair:…" is the bridge's own/);
    status400(() => validateChangeset(CS([wall()], { exceptions: [row({ unique_id: "s1", box: { min: [0, 0, 0], max: [100, 5400, 3000] } })] })), /exceptions\[0\]: the box's plan sides/);
    const v = validateChangeset(CS([wall()], { exceptions: [{ unique_id: "u", reason: "r", source: "x", box: BOX }] }));
    expect(v.exceptions).toEqual([{ unique_id: "u", name: null, reason: "r" }]);
    expect(v.ignored.map((i) => i.field)).toEqual(["exceptions[0].source", "exceptions[0].box"]);
    expect(v.ignored.every((i) => i.why === "ignored: not a field this bridge keeps")).toBe(true);
  });
});

// ── MA-8-7: foreign types (amendment 16) and a create that replaces (D16).
describe("MA-8-7 foreignOf: the shared cases (fixtures/changeset-ops/foreign-cases.json, also read by promote-check)", () => {
  const FX = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/foreign-cases.json", import.meta.url), "utf8"));
  const cat = { types: FX.catalog };
  for (const c of FX.cases) it(c.name, () => expect(foreignOf(c.kind, c.type_before, cat, core.sameCategory)).toBe(c.foreign));
  it("no catalogue, an empty one or no type_before judges nothing (null) - and a retype with null is not pre-ticked", () => {
    expect(foreignOf("wall", "Generic - 200mm", null, core.sameCategory)).toBeNull();
    expect(foreignOf("wall", "Generic - 200mm", { types: [] }, core.sameCategory)).toBeNull();
    expect(foreignOf("wall", null, cat, core.sameCategory)).toBeNull();
  });
});

describe("MA-8-7: a foreign retype is never pre-ticked; a column or beam retype never is; a posted foreign is ignored", () => {
  const FX = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/foreign-cases.json", import.meta.url), "utf8"));
  const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8";
  const opts = { member: true, catalog: { types: FX.catalog }, sameCategory: core.sameCategory };
  const retype = (kind, before, place, over = {}) => ({ op: "retype", kind, target: { unique_id: UID, type_before: before }, place, validate: { identity: { Class: "Ifc" + kind, Name: "X" } }, ...over });
  const one = (el, o = opts) => validateChangeset({ name: "Promote", source: "promote", elements: [el] }, o).elements[0];
  it("a catalogue row is pre-ticked (foreign false); another office's type is not (foreign true)", () => {
    expect(one(retype("wall", "Generic - 200mm", { TypeName: "BDS_EXT_ARC_CMU_200 mm" }))).toMatchObject({ pretick: true, foreign: false });
    expect(one(retype("wall", "Aussenwand 36.5", { TypeName: "BDS_EXT_ARC_CMU_200 mm" }))).toMatchObject({ pretick: false, foreign: true });
  });
  it("a column or beam retype is never pre-ticked, even from a catalogue row", () => {
    expect(one(retype("column", "BDS_INT_STR_CONC_COL : 300 x 600 mm", { FamilyName: "BDS_INT_STR_CONC_COL", TypeName: "300 x 600 mm" }))).toMatchObject({ pretick: false, foreign: false });
    expect(one(retype("beam", "M : B", { FamilyName: "BDS_INT_STR_CONC_BEAM", TypeName: "300 x 450 mm" }))).toMatchObject({ pretick: false, foreign: true });
  });
  it("no catalogue: foreign is null and nothing is pre-ticked; a posted foreign is listed as set by the bridge", () => {
    const e = one(retype("wall", "Generic - 200mm", { TypeName: "T" }), { member: true });
    expect(e).toMatchObject({ pretick: false, foreign: null });
    const v = validateChangeset({ name: "n", source: "promote", elements: [retype("wall", "Aussenwand", { TypeName: "T" }, { foreign: false })] }, opts);
    expect(v.elements[0]).toMatchObject({ foreign: true, pretick: false });
    expect(v.ignored).toEqual([{ field: "elements[0].foreign", why: "ignored: set by the bridge" }]);
  });
  it("an attach and a create carry no foreign", () => {
    expect(one({ op: "attach", kind: "wall", target: { unique_id: UID }, place: { BaseLevel: "L1", TopLevel: "L2" }, validate: { identity: { Class: "IfcWall", Name: "W" } } }).foreign).toBeUndefined();
  });
});

describe("MA-8-7 (D16): a wall or floor create that replaces a DirectShape", () => {
  const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8", UID2 = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f9";
  const BOX = { min: [0, 0, 0], max: [6000, 300, 3000] };
  const make = (over = {}) => ({ ...wall(), replaces: { unique_id: UID, box: BOX }, ...over });
  const file = (els, o = { member: true }) => validateChangeset({ name: "Promote · L01", source: "promote", elements: els }, o);
  const floor = () => ({ kind: "floor", validate: { identity: { Class: "IFCSLAB", Name: "F" } }, place: { TypeName: "BDS_INT_STR_CONC_250 mm", LevelName: "Level 1", LocationLoop: [[0, 0, 0], [4000, 0, 0], [4000, 4000, 0], [0, 4000, 0]] } });

  it("is stored as {unique_id, box} on a create that is never pre-ticked, has no target, no foreign", () => {
    const e = file([make()]).elements[0];
    expect(e).toMatchObject({ op: "create", kind: "wall", replaces: { unique_id: UID, box: BOX }, pretick: false, target: null });
    expect(e).not.toHaveProperty("foreign");
    expect(file([{ ...floor(), replaces: { unique_id: UID, box: BOX } }]).elements[0].replaces.unique_id).toBe(UID);
  });
  it("is refused in words: a signed-out caller, another kind, another op, a bad uid or box", () => {
    status400(() => file([make()], { member: false }), /^elements\[0\]: a create that replaces removes an element — only a signed-in member files one/);
    status400(() => file([{ ...level(), replaces: { unique_id: UID, box: BOX } }]), /^elements\[0\]: only a wall or floor create replaces an element/);
    status400(() => file([{ op: "retype", kind: "wall", target: { unique_id: UID, type_before: "T" }, place: { TypeName: "T2" }, replaces: { unique_id: UID2, box: BOX }, validate: { identity: { Class: "IfcWall", Name: "W" } } }]), /^elements\[0\]: retype takes no replaces/);
    status400(() => file([make({ replaces: { unique_id: "nope", box: BOX } })]), /replaces\.unique_id must be a Revit UniqueId/);
    status400(() => file([make({ replaces: { unique_id: UID } })]), /replaces\.box must be/);
    status400(() => file([make({ replaces: { unique_id: UID, box: { min: [0, 0, 0], max: [0, 5, 5] } } })]), /box\.min must be below box\.max/);
    status400(() => file([make({ replaces: "x" })]), /replaces must be \{unique_id, box\}/);
  });
  it("review: replaces keeps the original's kind and category when sent, and 400s a bad one", () => {
    expect(file([make({ replaces: { unique_id: UID, box: BOX, kind: "generic", category: " Floors " } })]).elements[0].replaces).toEqual({ unique_id: UID, box: BOX, kind: "generic", category: "Floors" });
    status400(() => file([make({ replaces: { unique_id: UID, box: BOX, kind: "mass" } })]), /replaces\.kind must be/);
    status400(() => file([make({ replaces: { unique_id: UID, box: BOX, category: 5 } })]), /replaces\.category must be a short text/);
  });
  it("lists a stray key inside replaces and keeps nothing of it", () => {
    const v = file([make({ replaces: { unique_id: UID, box: BOX, why: "x" } })]);
    expect(v.ignored).toEqual([{ field: "elements[0].replaces.why", why: "ignored: not a field this bridge keeps" }]);
    expect(Object.keys(v.elements[0].replaces)).toEqual(["unique_id", "box"]);
  });
  it("one element is replaced once and carries no other ghost, in either order; two different elements are fine", () => {
    const retype = { op: "retype", kind: "wall", target: { unique_id: UID, type_before: "T" }, place: { TypeName: "T2" }, validate: { identity: { Class: "IfcWall", Name: "W" } } };
    status400(() => file([make(), make()]), /which another ghost of this changeset also names — a replaced element carries no other ghost, and two creates cannot replace one/);
    status400(() => file([make(), retype]), /a rehost replaces its element — it carries no other ghost/);
    status400(() => file([retype, make()]), /replaces .* which another ghost of this changeset also names/);
    expect(file([make(), make({ replaces: { unique_id: UID2, box: BOX } })]).elements).toHaveLength(2);
  });
  it("carryKey: the same element re-created as the same type is the same change (a decline is carried); another type is not", () => {
    const a = file([make()]).elements[0];
    expect(carryKey(a)).toBe(carryKey(file([make()]).elements[0]));
    expect(carryKey(a)).not.toBe(carryKey(file([make({ place: { ...wall().place, TypeName: "Other" } })]).elements[0]));
    expect(carryKey(file([wall()]).elements[0])).toBeNull(); // a plain create names no element
  });
});

// MA-8-10: a stair from a flag - one straight run between two levels, alone in its changeset. The cases are shared with the add-in's planner
// (tools/promote-check Ma8Stairs.cs: StairPlanner's body for `plan` equals `good`).
describe("validateChangeset — stair (MA-8-10)", () => {
  const cases = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/stair-cases.json", import.meta.url), "utf8"));
  const CHANGESET = cases.plan.flag.changeset, FLAG = cases.plan.flag.unique_id;
  const body = (placePatch = {}, elPatch = {}) => {
    const b = structuredClone(cases.good);
    for (const [k, v] of Object.entries(placePatch)) { if (v === null) delete b.elements[0].place[k]; else b.elements[0].place[k] = v; }
    Object.assign(b.elements[0], elPatch);
    return b;
  };
  const ok = (b) => validateChangeset(b).elements[0];

  it("the planner's good body is accepted: kind stair, the bridge's IFCSTAIR, place and from_flag kept as sent, caller-typed, never pre-ticked, nothing ignored", () => {
    const v = validateChangeset(cases.good);
    expect(v.ignored).toEqual([]);
    expect(v.elements).toHaveLength(1);
    expect(v.elements[0]).toMatchObject({ kind: "stair", op: "create", place: cases.good.elements[0].place, from_flag: { changeset: CHANGESET, unique_id: FLAG },
      typing: { typed_by: "caller" }, pretick: false, reason: cases.good.elements[0].reason });
    expect(v.elements[0].validate.identity.Class).toBe("IFCSTAIR");
    expect(CREATE_ENTITY.stair).toBe("IFCSTAIR");
    expect(VOCABULARY.at(-2)).toBe("stair"); // MA-8-14: terrain follows it
  });

  it.each(cases.refusals.map((c) => [c.name, c]))("refuses %s in words (400)", (_n, c) => status400(() => ok(body(c.place)), new RegExp(`^elements\\[0\\]: ${c.message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)));

  it("fixture self-consistency: the riser rows agree with ceil((f2f − 0.001) / max); the real guard is promote-check's Risers() assertions on the same rows (incl. 3040.3 / 190 = 17, the band the old 0.5 mm slack let through)", () => {
    for (const r of cases.risers) expect(Math.ceil((r.f2fMm - 0.001) / r.maxRiserMm), JSON.stringify(r)).toBe(r.risers);
    expect(Math.ceil(3000.0000001 / 187.5)).toBe(17); // a bare ceil is what the float-noise slack guards against
  });

  it("a stair is alone in its changeset: with any other element it is a 400 in words, whichever comes first", () => {
    const wall = { kind: "wall", validate: { identity: { Class: "IFCWALL", Name: "W" } }, place: { TypeName: "Generic - 200mm", LevelName: "L00", LocationCurve: { start: [0, 0, 0], end: [5000, 0, 0] } } };
    for (const els of [[cases.good.elements[0], wall], [wall, cases.good.elements[0]]])
      status400(() => validateChangeset({ ...cases.good, elements: els }), /^a stair changeset holds its stair and nothing else — Revit builds a stair in its own edit scope; file the rest apart$/);
    expect(validateChangeset({ ...cases.good, elements: [wall] }).elements).toHaveLength(1);
  });

  it("a stair is never typed from facts, a mark rides along, and the bridge's class replaces a posted one (listed)", () => {
    status400(() => ok(body({ TypeName: null }, { facts: { thickness_mm: 200 } })), /a stair needs place\.FamilyName and place\.TypeName/);
    expect(ok(body({ Mark: "ST-1" })).place.Mark).toBe("ST-1");
    const el = body().elements[0]; el.validate.identity.Class = "IFCSTAIRFLIGHT";
    const v = validateChangeset({ ...cases.good, elements: [el] });
    expect(v.elements[0].validate.identity.Class).toBe("IFCSTAIR");
    expect(v.ignored).toEqual([{ field: "elements[0].validate.identity.Class", why: "ignored: set by the bridge from kind" }]);
  });

  it("from_flag: {changeset: a uuid, unique_id: stair:…}; a stray key is listed and not kept; it belongs to a stair create only", () => {
    const withFlag = (f) => body({}, { from_flag: f });
    status400(() => ok(withFlag("x")), /^elements\[0\]: from_flag must be \{changeset, unique_id\}$/);
    status400(() => ok(withFlag({ changeset: "nope", unique_id: FLAG })), /from_flag\.changeset must be the id \(a uuid\) of the changeset that holds the flag/);
    status400(() => ok(withFlag({ changeset: CHANGESET, unique_id: "wall:1" })), /from_flag\.unique_id must be the stair flag's unique_id \(text starting "stair:", at most 64 characters\)/);
    status400(() => ok(withFlag({ changeset: CHANGESET, unique_id: "stair:" + "x".repeat(60) })), /from_flag\.unique_id/);
    const v = validateChangeset({ ...cases.good, elements: [{ ...cases.good.elements[0], from_flag: { changeset: CHANGESET.toUpperCase(), unique_id: FLAG, why: "x" } }] });
    expect(v.elements[0].from_flag).toEqual({ changeset: CHANGESET, unique_id: FLAG });
    expect(v.ignored).toEqual([{ field: "elements[0].from_flag.why", why: "ignored: not a field this bridge keeps" }]);
    expect(ok(body({}, { from_flag: undefined })).from_flag).toBeUndefined(); // a stair needs no flag: an agent's own is filed as it is
    const w = { kind: "wall", validate: { identity: { Class: "IFCWALL", Name: "W" } }, place: { TypeName: "T", LevelName: "L", LocationCurve: { start: [0, 0, 0], end: [1000, 0, 0] } }, from_flag: { changeset: CHANGESET, unique_id: FLAG } };
    status400(() => validateChangeset({ name: "n", elements: [w] }), /^elements\[0\]: from_flag belongs to a stair create only/);
  });

  it("a retype or any other op takes no stair fields: Risers and Going are a create's, and only a stair's", () => {
    const w = { kind: "wall", validate: { identity: { Class: "IFCWALL", Name: "W" } }, place: { TypeName: "T", LevelName: "L", LocationCurve: { start: [0, 0, 0], end: [1000, 0, 0] }, Risers: 16 } };
    status400(() => validateChangeset({ name: "n", elements: [w] }), /^elements\[0\]: a wall takes no place\.Risers$/);
    status400(() => validateChangeset({ name: "n", elements: [{ ...w, place: { ...w.place, Risers: undefined, Going: 250 } }] }), /a wall takes no place\.Going/);
  });
});

// MA-8-14: a terrain from a scan - one Toposolid of points around the storey's footprint, alone in its changeset. The cases are shared with the add-in's planner
// (tools/promote-check Ma8Terrain.cs: TerrainPlanner's body for `plan` equals `good`).
describe("validateChangeset — terrain (MA-8-14)", () => {
  const cases = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/terrain-cases.json", import.meta.url), "utf8"));
  const body = (placePatch = {}, elPatch = {}) => {
    const b = structuredClone(cases.good);
    for (const [k, v] of Object.entries(placePatch)) { if (v === null) delete b.elements[0].place[k]; else b.elements[0].place[k] = v; }
    Object.assign(b.elements[0], elPatch);
    return b;
  };
  const M = { member: true }; // a terrain is a signed-in member's (Propose terrain from the scan)
  const ok = (b) => validateChangeset(b, M).elements[0];

  it("the planner's good body is accepted: kind terrain, the bridge's IFCGEOGRAPHICELEMENT, place and from_scan kept as sent, caller-typed, never pre-ticked, nothing ignored", () => {
    const v = validateChangeset(cases.good, M);
    expect(v.ignored).toEqual([]);
    expect(v.elements).toHaveLength(1);
    expect(v.elements[0]).toMatchObject({ kind: "terrain", op: "create", place: cases.good.elements[0].place, from_scan: cases.good.elements[0].from_scan,
      typing: { typed_by: "caller" }, pretick: false, reason: cases.good.elements[0].reason });
    expect(v.elements[0].validate.identity.Class).toBe("IFCGEOGRAPHICELEMENT");
    expect(CREATE_ENTITY.terrain).toBe("IFCGEOGRAPHICELEMENT");
    expect(VOCABULARY.at(-1)).toBe("terrain");
    expect(PLACE_KEPT).toContain("Points");
  });

  it.each(cases.refusals.map((c) => [c.name, c]))("refuses %s in words (400)", (_n, c) =>
    status400(() => ok(body(c.place ?? {}, c.el ?? {})), new RegExp(`^elements\\[0\\]: ${c.message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)));

  it("MA-8-14 review: only a signed-in member files a terrain - the machine credential (member false) is a 400 in words; more than 2000 points is a 400", () => {
    status400(() => validateChangeset(cases.good), /^elements\[0\]: a terrain is filed by a signed-in member from Revit \(Propose terrain from the scan\) — the machine credential files none; nothing was saved$/);
    const many = Array.from({ length: 2001 }, (_, i) => [i * 10, (i % 7) * 10, -300]);
    status400(() => ok(body({ Points: many })), /^elements\[0\]: a terrain needs place\.Points, 3 to 2000 finite \[x,y,z\] points$/);
  });

  it("a terrain is alone in its changeset: with any other element it is a 400 in words, whichever comes first", () => {
    const w = { kind: "wall", validate: { identity: { Class: "IFCWALL", Name: "W" } }, place: { TypeName: "Generic - 200mm", LevelName: "L00", LocationCurve: { start: [0, 0, 0], end: [5000, 0, 0] }, BaseElevation: 0, TopElevation: 3000 } };
    for (const els of [[cases.good.elements[0], w], [w, cases.good.elements[0]]])
      status400(() => validateChangeset({ ...cases.good, elements: els }, M), /^a terrain changeset holds its terrain and nothing else — file the rest apart$/);
  });

  it("a terrain is never typed from facts, the family is optional, and the bridge's class replaces a posted one (listed)", () => {
    status400(() => ok(body({ TypeName: null }, { facts: { thickness_mm: 200 } })), /a terrain needs place\.TypeName/);
    expect(ok(body({ FamilyName: null })).place.FamilyName).toBeUndefined();
    status400(() => ok(body({ FamilyName: 7 })), /place\.FamilyName must be text/);
    const el = body().elements[0]; el.validate.identity.Class = "IFCSLAB";
    const v = validateChangeset({ ...cases.good, elements: [el] }, M);
    expect(v.elements[0].validate.identity.Class).toBe("IFCGEOGRAPHICELEMENT");
    expect(v.ignored).toEqual([{ field: "elements[0].validate.identity.Class", why: "ignored: set by the bridge from kind" }]);
  });

  it("from_scan: {changeset: a uuid}; a stray key is listed and not kept; it belongs to a terrain create only; the id is kept lower case", () => {
    const withScan = (f) => body({}, { from_scan: f });
    status400(() => ok(withScan("x")), /^elements\[0\]: a terrain needs from_scan \{changeset\}/);
    status400(() => ok(withScan({ changeset: "nope" })), /from_scan\.changeset must be the id \(a uuid\) of the survey changeset/);
    const v = validateChangeset({ ...cases.good, elements: [{ ...cases.good.elements[0], from_scan: { changeset: cases.plan.changeset.id.toUpperCase(), why: "x" } }] }, M);
    expect(v.elements[0].from_scan).toEqual({ changeset: cases.plan.changeset.id });
    expect(v.ignored).toEqual([{ field: "elements[0].from_scan.why", why: "ignored: not a field this bridge keeps" }]);
    const w = { kind: "wall", validate: { identity: { Class: "IFCWALL", Name: "W" } }, place: { TypeName: "T", LevelName: "L", LocationCurve: { start: [0, 0, 0], end: [1000, 0, 0] } }, from_scan: { changeset: cases.plan.changeset.id } };
    status400(() => validateChangeset({ name: "n", elements: [w] }, M), /^elements\[0\]: from_scan belongs to a terrain create only/);
  });

  it("Points belong to a terrain only: a wall carrying them is a 400", () => {
    const w = { kind: "wall", validate: { identity: { Class: "IFCWALL", Name: "W" } }, place: { TypeName: "T", LevelName: "L", LocationCurve: { start: [0, 0, 0], end: [1000, 0, 0] }, Points: [[0, 0, 0]] } };
    status400(() => validateChangeset({ name: "n", elements: [w] }, M), /^elements\[0\]: a wall takes no place\.Points$/);
  });
});

describe("checkFromScan (MA-8-14): the survey changeset a terrain starts from", () => {
  const cases = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/terrain-cases.json", import.meta.url), "utf8"));
  const M = { member: true };
  const terrain = () => validateChangeset(structuredClone(cases.good), M).elements;
  const survey = (over = {}) => ({ id: cases.plan.changeset.id, name: cases.plan.changeset.name, status: "proposed", claimed: false, job: { id: "job-0003", reader: "sentinel-survey 0.6.0" }, elements: [], ...over });
  const fails = (fn, status, re) => { try { fn(); throw new Error("no throw"); } catch (e) { expect(e.status).toBe(status); expect(e.message).toMatch(re); } };

  it("passes with a survey changeset the bridge built; no from_scan checks nothing", () => {
    expect(() => checkFromScan(terrain(), [survey()])).not.toThrow();
    expect(() => checkFromScan([{ kind: "wall" }], [])).not.toThrow();
  });
  it("409: one live terrain per scan - a proposed one from the same scan is named; a withdrawn one frees it", () => {
    const filed = (status) => ({ id: "other", name: "Terrain · L00 · from Survey job-0003 · GR-FFL", status, elements: terrain() });
    fails(() => checkFromScan(terrain(), [survey(), filed("proposed")]), 409, /^elements\[0\]: a terrain from "Survey job-0003 · GR-FFL"'s scan is already filed \("Terrain · L00 · from Survey job-0003 · GR-FFL"\) — withdraw it first; nothing was saved$/);
    expect(() => checkFromScan(terrain(), [survey(), filed("withdrawn")])).not.toThrow();
  });
  it("MA-8-14 review round 1: an applied terrain still standing holds the scan (409); its newest Undo row an undo, or the terrain not the part applied, frees it", () => {
    const t = { ...terrain()[0], proposal_guid: "g1" };
    const built = (status, applied = ["g1"]) => ({ id: "other", name: "Terrain · L00 · from Survey job-0003 · GR-FFL", status, elements: [t], result: { applied: applied.map((g) => ({ proposal_guid: g })) } });
    const row = (id, op) => ({ id, entity_id: "other", new_value: { op, guids: ["g1"] } });
    for (const st of ["applied", "partially_applied"])
      fails(() => checkFromScan(terrain(), [survey(), built(st)]), 409, /^elements\[0\]: a terrain from "Survey job-0003 · GR-FFL"'s scan is already built as "Terrain · L00 · from Survey job-0003 · GR-FFL" \(applied\) — undo it in Revit first; nothing was saved$/);
    expect(() => checkFromScan(terrain(), [survey(), built("applied")], [row(1, "undo")])).not.toThrow();
    fails(() => checkFromScan(terrain(), [survey(), built("applied")], [row(1, "undo"), row(2, "redo")]), 409, /undo it in Revit first/);   // the newest row decides
    expect(() => checkFromScan(terrain(), [survey(), built("applied", ["x"])])).not.toThrow();
  });
  it("MA-8-14 review round 2: one terrain per scan, not per changeset - another job's survey changeset sharing an evidence sha (a re-run), or another storey of the same job, holds it", () => {
    const ev = (sha) => [{ id: "ev-scan", sha256: sha }];
    const mine = survey({ job: { id: "job-0004", ledger_id: 52, reader: "sentinel-survey 0.6.0", evidence: ev("aa") } });
    const t = { ...terrain()[0], proposal_guid: "g1", from_scan: { changeset: "first" } };
    const first = (job, over = {}) => ({ id: "first", name: "Survey job-0003 · GR-FFL (job-0003)", status: "proposed", claimed: false, job: { reader: "sentinel-survey 0.6.0", ...job }, elements: [], ...over });
    const filed = (status) => ({ id: "other", name: "Terrain · L00 · from job-0003", status, elements: [t], result: { applied: [{ proposal_guid: "g1" }] } });
    fails(() => checkFromScan(terrain(), [mine, first({ id: "job-0003", ledger_id: 41, evidence: ev("aa") }), filed("proposed")]), 409, /is already filed \("Terrain · L00 · from job-0003"\) — withdraw it first/);
    fails(() => checkFromScan(terrain(), [mine, first({ id: "job-0003", ledger_id: 41, evidence: ev("aa") }), filed("applied")]), 409, /is already built as "Terrain · L00 · from job-0003" \(applied\) — undo it in Revit first/);
    fails(() => checkFromScan(terrain(), [mine, first({ id: "job-0004", ledger_id: 52 }), filed("proposed")]), 409, /withdraw it first/);   // the same job, another storey
    expect(() => checkFromScan(terrain(), [mine, first({ id: "job-0003", ledger_id: 41, evidence: ev("bb") }), filed("proposed")])).not.toThrow();   // other bytes: another scan
    expect(() => checkFromScan(terrain(), [mine, first({ id: "job-0003", ledger_id: 41, evidence: [{ id: "ev-scan" }] }), filed("proposed")])).not.toThrow();   // no sha: not matched
    // review round 3: the same bytes admitted from another path (a new evidence id, the same sha256) are the same scan - both 409s
    fails(() => checkFromScan(terrain(), [mine, first({ id: "job-0003", ledger_id: 41, evidence: [{ id: "ev-copy", sha256: "aa" }] }), filed("proposed")]), 409, /withdraw it first/);
    fails(() => checkFromScan(terrain(), [mine, first({ id: "job-0003", ledger_id: 41, evidence: [{ id: "ev-copy", sha256: "aa" }] }), filed("applied")]), 409, /undo it in Revit first/);
  });
  it("404: the project holds no such changeset", () => {
    fails(() => checkFromScan(terrain(), []), 404, /^elements\[0\]: from_scan names changeset 5b1c6f3e-2a4d-4e8f-9c1a-7d2e3f4a5b6c, which this project does not hold — nothing was saved$/);
  });
  it("400: a posted body, an IFC job's or a drawing job's changeset has no scan behind it", () => {
    for (const over of [{ claimed: true }, { job: null }, { job: { id: "job-0007", reader: "sentinel-ifc 0.2.1" } }, { job: { id: "job-0008", reader: "sentinel-drawing 0.1.0" } }])
      fails(() => checkFromScan(terrain(), [survey(over)]), 400, /^elements\[0\]: changeset "Survey job-0003 · GR-FFL" was not built from a survey job the bridge ran — there is no scan behind a terrain from it; nothing was saved$/);
  });
});

describe("checkFromFlag (MA-8-10): the flag a stair starts from, and one live stair per flag", () => {
  const cases = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/stair-cases.json", import.meta.url), "utf8"));
  const f = cases.plan.flag;
  const stair = () => validateChangeset(structuredClone(cases.good)).elements;
  const flagCs = (over = {}) => ({ id: f.changeset, name: "Survey L00", status: "proposed", elements: [], exceptions: [{ unique_id: f.unique_id, name: f.name, reason: "r", kind: "stair", storey: "L00", box: { min: f.min, max: f.max }, source: "pick" }], ...over });
  const other = (status, over = {}) => { const [e] = stair(); return { id: "11111111-2222-4333-8444-555555555555", name: "Stair · L00 → L01 · from Stair picked on L00", status, elements: [e], result: null, ...over }; };
  const fails = (fn, status, re) => { try { fn(); throw new Error("no throw"); } catch (e) { expect(e.status).toBe(status); expect(e.message).toMatch(re); } };

  it("passes with the flag in place and nothing else from it; no from_flag checks nothing", () => {
    expect(() => checkFromFlag(stair(), [flagCs()], [])).not.toThrow();
    const [e] = stair(); delete e.from_flag;
    expect(() => checkFromFlag([e], [], [])).not.toThrow();
  });
  it("404: no such changeset, or it holds no such stair flag (a wall's exception row is not one)", () => {
    fails(() => checkFromFlag(stair(), [], []), 404, /^elements\[0\]: from_flag names changeset 0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d, which this project does not hold — nothing was saved$/);
    fails(() => checkFromFlag(stair(), [flagCs({ exceptions: [] })], []), 404, /^elements\[0\]: changeset "Survey L00" holds no stair flag stair:pick-0a1b2c3d — nothing was saved$/);
    fails(() => checkFromFlag(stair(), [flagCs({ exceptions: [{ unique_id: f.unique_id, name: "w", reason: "r" }] })], []), 404, /holds no stair flag/);
  });
  it("400: the stair rises from another storey than the flag's; a run end outside the flag's box (1 mm of slack)", () => {
    const e = stair(); e[0].place.LevelName = "L01";
    fails(() => checkFromFlag(e, [flagCs()], []), 400, /^elements\[0\]: the flag is on L00, the stair rises from L01 — a stair starts on its flag's storey$/);
    const out = stair(); out[0].place.LocationCurve.end = [5501.5, 2650, 0];
    fails(() => checkFromFlag(out, [flagCs()], []), 400, /^elements\[0\]: the run leaves the flag's box — its end \(5502, 2650\) is outside 1000\.\.5500 × 2000\.\.3300 mm$/);
    const edge = stair(); edge[0].place.LocationCurve.end = [5501, 3301, 0];
    expect(() => checkFromFlag(edge, [flagCs()], [])).not.toThrow();
    const lo = stair(); lo[0].place.LocationCurve.start = [999.5, 1998.9, 0];
    fails(() => checkFromFlag(lo, [flagCs()], []), 400, /its start \(1000, 1999\) is outside/);
  });
  it("409: the flag is already proposed — withdraw it first", () => {
    fails(() => checkFromFlag(stair(), [flagCs(), other("proposed")], []), 409, /^elements\[0\]: this flag is already proposed as "Stair · L00 → L01 · from Stair picked on L00" — withdraw it first$/);
  });
  it("amendment 2: an applied stair holds the flag until Undo; a stair undone in Revit frees it, a Redo holds it again", () => {
    const mine = stair()[0], g = mine.proposal_guid;
    const applied = other("applied", { elements: [mine], result: { applied: [{ proposal_guid: g, revit_element_id: 5 }], rejected: [] } });
    const row = (id, op, entity = applied.id) => ({ id, entity_id: entity, new_value: { op, guids: [g] } });
    fails(() => checkFromFlag(stair(), [flagCs(), applied], []), 409,
      /^elements\[0\]: this flag is already built as "Stair · L00 → L01 · from Stair picked on L00" \(applied\) — undo it in Revit first$/);
    expect(() => checkFromFlag(stair(), [flagCs(), applied], [row(7, "undo")])).not.toThrow();
    fails(() => checkFromFlag(stair(), [flagCs(), applied], [row(7, "undo"), row(9, "redo")]), 409, /already built/); // the newest row decides, whatever the order read
    fails(() => checkFromFlag(stair(), [flagCs(), applied], [row(9, "redo"), row(7, "undo")]), 409, /already built/);
    expect(() => checkFromFlag(stair(), [flagCs(), applied], [row(7, "redo"), row(9, "undo")])).not.toThrow();
    expect(() => checkFromFlag(stair(), [flagCs(), applied], [row(12, "redo", "another-changeset"), row(7, "undo")])).not.toThrow(); // another changeset's rows are not this one's
  });
  it("a withdrawn or declined stair, and a partially applied changeset whose stair was not applied, free the flag", () => {
    for (const status of ["withdrawn", "declined"]) expect(() => checkFromFlag(stair(), [flagCs(), other(status)], [])).not.toThrow();
    expect(() => checkFromFlag(stair(), [flagCs(), other("partially_applied", { result: { applied: [], rejected: [] } })], [])).not.toThrow();
  });
  it("the flag's own changeset, with its stair from another flag, holds nothing against this one", () => {
    const [e] = stair(); e.from_flag = { changeset: f.changeset, unique_id: "stair:pick-ffffffff" };
    expect(() => checkFromFlag(stair(), [flagCs(), other("proposed", { elements: [e] })], [])).not.toThrow();
  });
});

describe("a built stair (MA-8-10): keepBuilt and the changeset_applied row's stairs", () => {
  const cases = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/stair-cases.json", import.meta.url), "utf8"));
  const built = { risers: 16, riser_mm: 187.5, going_mm: 250, width_mm: 1200, runs: 1, railings: 2 };
  it("keepBuilt keeps the six fields of a signed-in member's read; anything else out of range or missing is null; the machine credential's read is not trusted", () => {
    expect(keepBuilt({ ...built, extra: 1 }, true)).toEqual(built);
    for (const bad of [{ ...built, risers: 0 }, { ...built, risers: 16.5 }, { ...built, riser_mm: -1 }, { ...built, going_mm: 2001 }, { ...built, width_mm: "1200" }, { ...built, runs: 11 }, { ...built, railings: 21 }, { risers: 16 }, null, [], "x"])
      expect(keepBuilt(bad, true), JSON.stringify(bad)).toBeNull();
    expect(keepBuilt(built, false)).toEqual({ why: "reported with the machine credential — sign in in Revit" });
    expect(keepBuilt(undefined, false)).toEqual({ why: "reported with the machine credential — sign in in Revit" });
  });
  it("stairsOf: planned beside built; as_planned only when Revit's read agrees (risers, going and width within 1 mm); no read says so; a non-stair entry is left out", () => {
    const [e] = validateChangeset(structuredClone(cases.good)).elements;
    const wall = { proposal_guid: "w", kind: "wall", place: {} };
    const planned = { risers: 16, going_mm: 250, width_mm: 1200 };
    const run = (b) => stairsOf([e, wall], [{ proposal_guid: e.proposal_guid, built: b }, { proposal_guid: "w" }]);
    expect(run(built)).toEqual([{ proposal_guid: e.proposal_guid, planned, built, as_planned: true }]);
    expect(run({ ...built, risers: 17 })[0].as_planned).toBe(false);
    expect(run({ ...built, going_mm: 251.5 })[0].as_planned).toBe(false);
    expect(run({ ...built, width_mm: 1200.9 })[0].as_planned).toBe(true);
    // MA-8 nits (F-B4-3): the plan now says 250 (StairPlanner.Facts snaps the type's noise); a stair Revit reads back as 249.99999999999997 is still as planned
    expect(run({ ...built, going_mm: 249.99999999999997 })[0].as_planned).toBe(true);
    expect(run(null)).toEqual([{ proposal_guid: e.proposal_guid, planned, built: null, as_planned: null, note: "Revit sent no read of what it built — check the model" }]);
    expect(run({ why: "reported with the machine credential — sign in in Revit" })[0]).toMatchObject({ built: { why: expect.any(String) }, as_planned: null });
  });
});
