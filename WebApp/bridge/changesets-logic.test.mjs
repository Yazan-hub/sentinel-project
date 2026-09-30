import { describe, it, expect } from "vitest";
import {
  VOCABULARY, OPS, MAX_CHANGESET_ELEMENTS,
  validateChangeset, attachVerdicts, canWithdraw, deriveResultStatus, unattributedFailures,
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
  const status400 = (fn, re) => {
    try { fn(); throw new Error("no throw"); }
    catch (e) { expect(e.status).toBe(400); expect(e.message).toMatch(re); }
  };

  it("OPS is create, retype, attach; VOCABULARY is unchanged", () => {
    expect(OPS).toEqual(["create", "retype", "attach"]);
    expect(VOCABULARY).toEqual(["wall", "floor", "level", "grid"]);
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

  it("retype or attach on anything but a wall is a 400", () => {
    status400(() => validateChangeset(CS([retype({ kind: "floor" })])), /retype is for walls only/);
    status400(() => validateChangeset(CS([attach({ kind: "level" })])), /attach is for walls only/);
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
