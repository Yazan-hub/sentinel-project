import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  VOCABULARY, OPS, OP_KINDS, MAX_CHANGESET_ELEMENTS, TRUST_FIELDS, ADDIN_SOURCES,
  validateChangeset, outlineProblem, attachVerdicts, canWithdraw, deriveResultStatus, unattributedFailures,
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
const status400 = (fn, re) => {
  try { fn(); throw new Error("no throw"); }
  catch (e) { expect(e.status).toBe(400); expect(e.message).toMatch(re); }
};
// MA-1a step 2 adds column and furniture (Ghost Builder's unhosted point families).
const MA1 = ["wall", "floor", "level", "grid", "roof", "ceiling", "door", "window", "column", "furniture"];

describe("VOCABULARY", () => {
  it("is the MA-1 list, with MA-1a step 2's column and furniture", () => expect(VOCABULARY).toEqual(MA1));
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
    try { validateChangeset(CS([wall(), { ...wall(), kind: "beam" }])); throw new Error("no throw"); }
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

  it("OPS is create, retype, attach; VOCABULARY is the MA-1 list", () => {
    expect(OPS).toEqual(["create", "retype", "attach"]);
    expect(VOCABULARY).toEqual(MA1);
  });

  it("OP_KINDS: create takes the vocabulary, retype six element kinds, attach walls only", () => {
    expect(OP_KINDS).toEqual({ create: VOCABULARY, retype: ["wall", "floor", "roof", "ceiling", "door", "window"], attach: ["wall"] });
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
    status400(() => validateChangeset(CS([wall({ kind: "beam" })])), /kind "beam" is not supported — allowed: wall, floor, level, grid, roof, ceiling, door, window, column, furniture/);
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
  const floor = make("floor", "IFCSLAB", "F1", { TypeName: "Generic 150mm", LocationLoop: [[0, 0, 0], [5000, 0, 0], [5000, 5000, 0]] });
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
      for (const f of ["SillHeight", "FlipFacing", "FlipHand", "Boundary", "Offset"]) status400(() => ok(b({ [f]: 1 })), new RegExp(`takes no place\\.${f}`));
  });

  it("column and furniture are create-only", () => {
    const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8";
    for (const kind of ["column", "furniture"])
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
    const trust = { pretick: true, accuracy: { status: "within_tolerance" }, confidence: 0.99, typing: { by: "rule" }, claimed: false, proposal_guid: "mine" };
    const v = validateChangeset(CS([wall(trust)], trust));
    expect(v.ignored).toEqual([
      ...TRUST_FIELDS.map((f) => ({ field: f, why: SET })),
      ...TRUST_FIELDS.map((f) => ({ field: `elements[0].${f}`, why: SET })),
    ]);
    expect(v.claimed).toBe(true);
    expect(v.elements[0]).toMatchObject({ pretick: false, accuracy: { status: "not_measured" } });
    expect(v.elements[0].proposal_guid).not.toBe("mine");
    for (const f of ["confidence", "typing", "claimed"]) expect(v.elements[0]).not.toHaveProperty(f);
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
    expect(validateChangeset(CS(ops, { source: "promote" }), MEMBER).elements.map((e) => e.pretick)).toEqual([true, true]);
    expect(validateChangeset(CS(ops, { source: "promote" })).elements.map((e) => e.pretick)).toEqual([false, false]);
    expect(validateChangeset(CS(ops, { source: { reader: " promote " } })).elements.map((e) => e.pretick)).toEqual([false, false]);
    expect(validateChangeset(CS(ops, { source: "agent" }), MEMBER).elements.map((e) => e.pretick)).toEqual([false, false]);
    expect(validateChangeset(CS([change("retype", { TypeName: "T2" })], { source: "promote" }), MEMBER).elements[0].pretick).toBe(false);
  });

  it("contract 2's source object: the reader is the stored source, a job_id is ignored and listed — no survey job exists", () => {
    const v = validateChangeset(CS([wall()], { source: { reader: "sentinel-survey 0.1", job_id: "job-0042", host: "x" } }));
    expect(v.source).toBe("sentinel-survey 0.1");
    expect(v.claimed).toBe(true);
    expect(v.ignored).toEqual([
      { field: "source.job_id", why: "ignored: no survey job the bridge ran is named by it — the source is marked claimed" },
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
    expect(ADDIN_SOURCES).toEqual(["dwg", "promote"]);
    expect(TRUST_FIELDS).toEqual(["pretick", "accuracy", "confidence", "typing", "claimed", "proposal_guid"]);
  });
});
