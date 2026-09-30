import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  VOCABULARY, OPS, OP_KINDS, MAX_CHANGESET_ELEMENTS,
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
const MA1 = ["wall", "floor", "level", "grid", "roof", "ceiling", "door", "window"];

describe("VOCABULARY", () => {
  it("is the MA-1 list", () => expect(VOCABULARY).toEqual(MA1));
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
    try { validateChangeset(CS([wall(), { ...wall(), kind: "column" }])); throw new Error("no throw"); }
    catch (e) {
      expect(e.status).toBe(400);
      expect(e.message).toMatch(/\[1\]/);
      expect(e.message).toMatch(/wall, floor, level, grid, roof, ceiling, door, window/);
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
    status400(() => validateChangeset(CS([wall({ kind: "column" })])), /kind "column" is not supported — allowed: wall, floor, level, grid, roof, ceiling, door, window/);
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
