import { describe, it, expect } from "vitest";
import { validateElement, applies, adjudicate, judgeModel, versionNotes, groupFailuresForBcf, raisedIdsTitleKey, DEMO_IDS, type IdsSpec, type Failure } from "./ids";
import type { ElementProperties } from "./adapter/element-properties";

const elem = (cls: string, name: string | undefined, psets: { name: string; rows: { name: string; value: string }[] }[] = [], guid = "G"): ElementProperties => ({
  modelId: "m", localId: 1, identity: { Class: cls, GlobalId: guid, ...(name != null ? { Name: name } : {}) }, psets, quantities: [],
});

// Walls must carry Pset_WallCommon.FireRating (required).
const FIRE_IDS: IdsSpec = {
  title: "Walls need a fire rating",
  specifications: [{
    name: "FireRating on walls",
    applicability: { entity: "IFCWALL" },
    requirements: { attributes: [], properties: [{ pset: "Pset_WallCommon", name: "FireRating", cardinality: "required" }] },
  }],
};

describe("applies (scoping)", () => {
  it("matches by IFC entity (regex, case-insensitive)", () => {
    expect(applies(FIRE_IDS.specifications[0], elem("IFCWALL", "w"))).toBe(true);
    expect(applies(FIRE_IDS.specifications[0], elem("IFCBEAM", "b"))).toBe(false);
  });
});

describe("validateElement", () => {
  it("passes a compliant wall and fails a missing-property wall with a reason", () => {
    const ok = validateElement(FIRE_IDS, elem("IFCWALL", "w", [{ name: "Pset_WallCommon", rows: [{ name: "FireRating", value: "REI60" }] }]));
    expect(ok).toMatchObject({ inScope: true, pass: true, failures: [] });

    const bad = validateElement(FIRE_IDS, elem("IFCWALL", "w"));
    expect(bad.pass).toBe(false);
    expect(bad.failures[0]).toMatchObject({ requirement: "Pset_WallCommon.FireRating", reason: "REQUIRED but missing" });
  });

  it("out-of-scope elements are not judged (inScope false, pass true)", () => {
    expect(validateElement(FIRE_IDS, elem("IFCBEAM", "b"))).toMatchObject({ inScope: false, pass: true });
  });

  it("enforces an exact value (case-insensitive) and a prohibited facet", () => {
    const spec: IdsSpec = { title: "t", specifications: [{ name: "s", applicability: { entity: "IFCWALL" }, requirements: { attributes: [], properties: [{ pset: "P", name: "Grade", value: "A", cardinality: "required" }] } }] };
    expect(validateElement(spec, elem("IFCWALL", "w", [{ name: "P", rows: [{ name: "Grade", value: "a" }] }])).pass).toBe(true); // case-insensitive match
    expect(validateElement(spec, elem("IFCWALL", "w", [{ name: "P", rows: [{ name: "Grade", value: "B" }] }])).pass).toBe(false);

    const proh: IdsSpec = { title: "t", specifications: [{ name: "s", applicability: { entity: "IFCWALL" }, requirements: { attributes: [], properties: [{ pset: "P", name: "Legacy", cardinality: "prohibited" }] } }] };
    expect(validateElement(proh, elem("IFCWALL", "w", [{ name: "P", rows: [{ name: "Legacy", value: "x" }] }])).pass).toBe(false); // present but prohibited
    expect(validateElement(proh, elem("IFCWALL", "w")).pass).toBe(true); // absent → fine
  });
});

describe("adjudicate (the referee)", () => {
  it("accepts a fully-compliant proposal", () => {
    const a = adjudicate(FIRE_IDS, [elem("IFCWALL", "w", [{ name: "Pset_WallCommon", rows: [{ name: "FireRating", value: "REI60" }] }])]);
    expect(a.verdict).toBe("accepted");
    expect(a.summary).toMatchObject({ elements: 1, in_scope: 1, passing: 1, failing: 0 });
    expect(a.failures).toHaveLength(0);
  });

  it("rejects a proposal with a failing element and attributes the failure to its GlobalId", () => {
    const a = adjudicate(FIRE_IDS, [
      elem("IFCWALL", "w", [{ name: "Pset_WallCommon", rows: [{ name: "FireRating", value: "REI60" }] }], "GOOD"),
      elem("IFCWALL", "w", [], "BAD"),
    ]);
    expect(a.verdict).toBe("rejected");
    expect(a.summary).toMatchObject({ in_scope: 2, passing: 1, failing: 1 });
    expect(a.failures).toHaveLength(1);
    expect(a.failures[0]).toMatchObject({ element: "BAD", reason: "REQUIRED but missing" });
  });

  it("ignores out-of-scope elements in the count", () => {
    const a = adjudicate(FIRE_IDS, [elem("IFCBEAM", "b"), elem("IFCDOOR", "d")]);
    expect(a.verdict).toBe("accepted"); // nothing in scope failed
    expect(a.summary.in_scope).toBe(0);
  });

  it("no IDS → verdict 'recorded' (logged, not judged)", () => {
    const a = adjudicate(null, [elem("IFCWALL", "w")]);
    expect(a.verdict).toBe("recorded");
    expect(a.summary.ids).toBeNull();
  });

  it("works with the bundled DEMO_IDS", () => {
    const a = adjudicate(DEMO_IDS, [elem("IFCWALL", undefined)]); // unnamed wall → fails "must be named" + missing IsExternal
    expect(a.verdict).toBe("rejected");
    expect(a.summary.failing).toBe(1);
  });

  it("does not throw on malformed pset/quantity groups (missing name/rows)", () => {
    // A real producer can emit a group with no name/rows (a Revit payload did, via field-vs-property
    // serialization). The referee must treat that as 'property absent', not crash the whole propose.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const broken: any = { modelId: "m", localId: 1, identity: { Class: "IFCWALL", GlobalId: "g", Name: "W" }, psets: [{}, { name: "Pset_WallCommon" }], quantities: [{}] };
    expect(() => adjudicate(FIRE_IDS, [broken])).not.toThrow();
    const a = adjudicate(FIRE_IDS, [broken]);
    expect(a.verdict).toBe("rejected"); // in scope (IFCWALL), FireRating absent → REQUIRED but missing
    expect(a.failures[0]).toMatchObject({ requirement: "Pset_WallCommon.FireRating" });
  });

  it("does not throw on a spec missing requirements.properties (attributes-only)", () => {
    // A partial/malformed IDS (server-cached or client-supplied) may drop one of the two requirement arrays.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spec: any = { title: "t", specifications: [{ name: "s", applicability: { entity: "IFCWALL" }, requirements: { attributes: [{ name: "Name", cardinality: "required" }] } }] };
    expect(() => adjudicate(spec, [elem("IFCWALL", "w")])).not.toThrow();
    expect(adjudicate(spec, [elem("IFCWALL", "w")]).verdict).toBe("accepted");
    expect(adjudicate(spec, [elem("IFCWALL", undefined)]).verdict).toBe("rejected");
  });

  it("does not throw on a spec missing requirements entirely", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spec: any = { title: "t", specifications: [{ name: "s", applicability: { entity: "IFCWALL" } }] };
    expect(() => adjudicate(spec, [elem("IFCWALL", "w")])).not.toThrow();
    expect(adjudicate(spec, [elem("IFCWALL", "w")]).verdict).toBe("accepted");
  });
});

describe("raisedIdsTitleKey — the dedup key of an already-raised topic title (H0 minor N33)", () => {
  it("strips the IDS: prefix and the (N failing) suffix, pinning today's output", () => {
    expect(raisedIdsTitleKey("IDS: Walls declare IsExternal — Pset_WallCommon.IsExternal (3 failing)"))
      .toBe("Walls declare IsExternal — Pset_WallCommon.IsExternal");
  });
  it("trims whitespace left by either strip, including a run stored between the key and the suffix", () => {
    expect(raisedIdsTitleKey("IDS: A — r1   (12 failing)")).toBe("A — r1");
    expect(raisedIdsTitleKey("IDS:    A — r1")).toBe("A — r1");
  });
  it("runs in well under 100 ms on a title with a 1M-space run before the suffix", () => {
    const title = `IDS: a${" ".repeat(1_000_000)}b (1 failing)`;
    const start = Date.now();
    expect(raisedIdsTitleKey(title)).toBe(`a${" ".repeat(1_000_000)}b`);
    expect(Date.now() - start).toBeLessThan(100);
  });
  it("leaves a title with no prefix or suffix unchanged", () => {
    expect(raisedIdsTitleKey("A — r1")).toBe("A — r1");
  });
});

describe("groupFailuresForBcf (governed reject → one issue per requirement)", () => {
  const fail = (specification: string, requirement: string, element: string | null): Failure & { element: string | null } =>
    ({ specification, requirement, reason: "REQUIRED but missing", element });

  it("groups failures by '<spec> — <requirement>' and collects failing GlobalIds", () => {
    const groups = groupFailuresForBcf([
      fail("Walls declare IsExternal", "Pset_WallCommon.IsExternal", "w1"),
      fail("Walls declare IsExternal", "Pset_WallCommon.IsExternal", "w2"),
      fail("Doors carry a FireRating", "Pset_DoorCommon.FireRating", "d1"),
    ]);
    expect(groups).toHaveLength(2);
    const wall = groups.find((g) => g.key.startsWith("Walls"))!;
    expect(wall).toMatchObject({ key: "Walls declare IsExternal — Pset_WallCommon.IsExternal", count: 2 });
    expect(wall.guids).toEqual(["w1", "w2"]);
  });

  it("drops requirements that already have an open issue (idempotent re-publish)", () => {
    const failures = [fail("A", "r1", "e1"), fail("B", "r2", "e2")];
    const open = ["A — r1"]; // one already raised
    const groups = groupFailuresForBcf(failures, open);
    expect(groups.map((g) => g.key)).toEqual(["B — r2"]);
  });

  it("returns empty when every requirement is already open, and when there are no failures", () => {
    expect(groupFailuresForBcf([])).toEqual([]);
    const failures = [fail("A", "r1", "e1")];
    expect(groupFailuresForBcf(failures, ["A — r1"])).toEqual([]);
  });

  it("omits blank/absent GlobalIds from the viewpoint selection", () => {
    const groups = groupFailuresForBcf([
      fail("A", "r1", null),
      fail("A", "r1", ""),
      fail("A", "r1", "e3"),
    ]);
    expect(groups[0]).toMatchObject({ count: 3, guids: ["e3"] });
  });
});

// IDS 1.0's rules as IfcTester reads them, for a specification read from an .ids file (ids10). The end-to-end proof is
// bridge/ids-conformance.test.mjs on tools/ids-conformance/mini (labels stamped by IfcTester); these pin the judge itself.
describe("IDS 1.0 rules (ids10)", () => {
  const wall = (rows: { name: string; value: string; type?: string }[], name = "W") => elem("IFCWALL", name, [{ name: "Pset_WallCommon", rows }]);
  const one = (req: Partial<IdsSpec["specifications"][0]["requirements"]>, extra: object = {}): IdsSpec => ({
    title: "t", specifications: [{ name: "s", applicability: { entity: "^IFCWALL$" }, requirements: { attributes: [], properties: [], ...req }, ids10: true, ...extra }],
  });
  const prop = (f: object) => one({ properties: [{ pset: "Pset_WallCommon", name: "FireRating", cardinality: "required", ...f }] });

  it("text is case-sensitive, a number matches within 1e-6 — Sentinel's own IDS stays case-insensitive", () => {
    expect(validateElement(prop({ value: "REI60" }), wall([{ name: "FireRating", value: "rei60" }])).pass).toBe(false);
    expect(validateElement({ ...prop({ value: "REI60" }), specifications: [{ ...prop({ value: "REI60" }).specifications[0], ids10: undefined }] }, wall([{ name: "FireRating", value: "rei60" }])).pass).toBe(true);
    expect(validateElement(prop({ value: "0.25" }), wall([{ name: "FireRating", value: "0.2500000001" }])).pass).toBe(true);
    expect(validateElement(prop({ value: "0.25" }), wall([{ name: "FireRating", value: "0.2501" }])).pass).toBe(false);
  });

  it("property set and property names are case-sensitive", () => {
    expect(validateElement(prop({}), elem("IFCWALL", "W", [{ name: "pset_wallcommon", rows: [{ name: "FireRating", value: "REI60" }] }])).failures[0].reason).toBe("REQUIRED but missing");
  });

  it("a prohibited facet with a value fails that value only", () => {
    const no = prop({ value: "REI30", cardinality: "prohibited" });
    expect(validateElement(no, wall([{ name: "FireRating", value: "REI60" }])).pass).toBe(true);
    expect(validateElement(no, wall([{ name: "FireRating", value: "REI30" }])).failures[0].reason).toBe('is "REI30", which it must not be');
    expect(validateElement(prop({ cardinality: "prohibited" }), wall([{ name: "FireRating", value: "REI30" }])).failures[0].reason).toBe('must be ABSENT but is "REI30"');
  });

  it("enumeration, bounds and length, with reasons that say the rule", () => {
    expect(validateElement(prop({ enumeration: ["REI60", "REI90"] }), wall([{ name: "FireRating", value: "REI30" }])).failures[0].reason).toBe('is "REI30", required one of "REI60", "REI90"');
    expect(validateElement(prop({ bounds: { minInclusive: 0.1, maxInclusive: 0.3 } }), wall([{ name: "FireRating", value: "0.5" }])).failures[0].reason).toBe('is "0.5", required a number ≥ 0.1 and ≤ 0.3');
    expect(validateElement(prop({ bounds: { minExclusive: 0 } }), wall([{ name: "FireRating", value: "n/a" }])).pass).toBe(false);
    expect(validateElement(prop({ length: { maxLength: 4 } }), wall([{ name: "FireRating", value: "REI60" }])).failures[0].reason).toBe("is 5 character(s) long, required at most 4");
  });

  it("dataType is judged where the reader carried the value's type, and never invented where it did not", () => {
    expect(validateElement(prop({ datatype: "IFCLABEL" }), wall([{ name: "FireRating", value: "true", type: "IFCBOOLEAN" }])).failures[0].reason).toBe("is a IFCBOOLEAN, required IFCLABEL");
    expect(validateElement(prop({ datatype: "IFCLABEL" }), wall([{ name: "FireRating", value: "REI60", type: "IFCLABEL" }])).pass).toBe(true);
    expect(validateElement(prop({ datatype: "IFCLABEL" }), wall([{ name: "FireRating", value: "REI60" }])).pass).toBe(true);
  });

  it("a property in applicability narrows the scope; an entity in requirements must match", () => {
    const ext = { ...one({ properties: [{ pset: "Pset_WallCommon", name: "FireRating", cardinality: "required" }] }) };
    ext.specifications[0].applicability.properties = [{ pset: "Pset_WallCommon", name: "IsExternal", value: "true", cardinality: "required" }];
    expect(validateElement(ext, wall([{ name: "IsExternal", value: "false" }])).inScope).toBe(false);
    expect(validateElement(ext, wall([{ name: "IsExternal", value: "true" }])).pass).toBe(false);
    const isSlab = one({ entity: { entity: "^IFCSLAB$" } });
    expect(validateElement(isSlab, wall([])).failures[0]).toMatchObject({ requirement: "@class", reason: "is IFCWALL, required /^IFCSLAB$/" });
  });

  it("a USERDEFINED predefined type is read from ObjectType", () => {
    const s: IdsSpec = { title: "t", specifications: [{ name: "s", applicability: { entity: "^IFCWALL$", predefinedType: "BLASTWALL" }, requirements: { attributes: [{ name: "Name", cardinality: "required" }], properties: [] }, ids10: true }] };
    const el = { ...elem("IFCWALL", undefined), identity: { Class: "IFCWALL", PredefinedType: "USERDEFINED", ObjectType: "BLASTWALL" } };
    expect(validateElement(s, el)).toMatchObject({ inScope: true, pass: false });
  });

  it("specification cardinality: prohibited fails each applicable element; required fails a whole model with none", () => {
    const door: IdsSpec = { title: "t", specifications: [{ name: "no doors", applicability: { entity: "^IFCDOOR$" }, requirements: { attributes: [], properties: [] }, cardinality: "prohibited", ids10: true }] };
    expect(validateElement(door, elem("IFCDOOR", "D")).failures[0].reason).toBe("the specification is PROHIBITED: no element may match it");
    const need: IdsSpec = { title: "t", specifications: [{ ...door.specifications[0], name: "a door", cardinality: "required" }] };
    expect(adjudicate(need, [elem("IFCWALL", "W")]).verdict).toBe("accepted"); // a changeset cannot lack an element
    expect(judgeModel(need, [elem("IFCWALL", "W")])).toMatchObject({ pass: false, failures: [{ element: null, specification: "a door", requirement: "(applicability)" }] });
    expect(judgeModel(need, [elem("IFCDOOR", "D")]).pass).toBe(true);
  });
});

// Round 2, from buildingSMART's official v1.0.0 cases (tools/ids-conformance/official): the rules they pinned beyond IfcTester 0.9.
describe("IDS 1.0 rules the official cases pin (ids10)", () => {
  const spec = (req: object, appl: object = { entity: "^IFCWALL$" }): IdsSpec => ({ title: "t", specifications: [{ name: "s", applicability: appl, requirements: { attributes: [], properties: [], ...req }, ids10: true }] });
  const real = (v: string) => elem("IFCWALL", "W", [{ name: "P", rows: [{ name: "Foo", value: v, type: "IFCREAL" }] }]);
  const foo = (f: object) => spec({ properties: [{ pset: "P", name: "Foo", cardinality: "required", ...f }] });

  it("numbers match within 1e-6 relative plus 1e-6 absolute, edges included (tolerance/*)", () => {
    expect(validateElement(foo({ value: "1." }), real("1.000002")).pass).toBe(true);
    expect(validateElement(foo({ value: "1." }), real("1.0000021")).pass).toBe(false);
    expect(validateElement(foo({ value: "100000." }), real("99999.899999")).pass).toBe(true);
    expect(validateElement(foo({ value: "0." }), real("0.0000011")).pass).toBe(false);
  });

  it("an exclusive bound tightens by the tolerance, an inclusive one loosens (tolerance/*_range_*)", () => {
    expect(validateElement(foo({ bounds: { minExclusive: 0 } }), real("0.000001")).pass).toBe(true);
    expect(validateElement(foo({ bounds: { minExclusive: 0 } }), real("0.0000009")).pass).toBe(false);
    expect(validateElement(foo({ bounds: { minInclusive: 0 } }), real("-0.000001")).pass).toBe(true);
    expect(validateElement(foo({ bounds: { minInclusive: 0 } }), real("-0.0000011")).pass).toBe(false);
  });

  it("class names are case-sensitive; a predefined type is inherited from the type object, or named by ElementType", () => {
    expect(validateElement(spec({ attributes: [{ name: "Name", cardinality: "required" }] }, { entity: "^IfcWall$" }), elem("IFCWALL", undefined)).inScope).toBe(false);
    const x = spec({ attributes: [{ name: "Name", cardinality: "required" }] }, { entity: "^IFCWALL$", predefinedType: "X" });
    expect(validateElement(x, { ...elem("IFCWALL", undefined), type: { Class: "IFCWALLTYPE", PredefinedType: "X" } }).inScope).toBe(true);
    const waldo = spec({}, { entity: "^IFCWALLTYPE$", predefinedType: "WALDO" });
    expect(validateElement(waldo, { ...elem("IFCWALLTYPE", "T"), identity: { Class: "IFCWALLTYPE", PredefinedType: "USERDEFINED", ElementType: "WALDO" } }).inScope).toBe(true);
  });

  it("an attribute holding \"\" fails even when optional; an empty property counts as absent", () => {
    const opt = spec({ attributes: [{ name: "Name", value: "Foobar", cardinality: "optional" }] });
    expect(validateElement(opt, elem("IFCWALL", "")).failures[0]?.reason).toBe("is empty");
    expect(validateElement(foo({ cardinality: "optional" }), real("")).pass).toBe(true);
  });

  it("a property set named by a pattern: every matching set must hold the property", () => {
    const any = spec({ properties: [{ pset: "", psetPattern: "^Foo_.*$", name: "Bar", cardinality: "required" }] });
    const sets = (...g: string[]) => elem("IFCWALL", "W", g.map((name) => ({ name, rows: name === "Foo_B" ? [] : [{ name: "Bar", value: "1" }] })));
    expect(validateElement(any, sets("Foo_A", "Other")).pass).toBe(true);
    expect(validateElement(any, sets("Foo_A", "Foo_B")).failures[0]?.reason).toBe("REQUIRED but missing");
  });
});

describe("ifcVersion is metadata (IDS 1.0 v1.0.0)", () => {
  it("judges a specification written for another schema, and says so beside the verdict", () => {
    const spec: IdsSpec = { title: "v", specifications: [{ name: "IFC2X3 walls", ifcVersion: ["IFC2X3"], ids10: true, applicability: { entity: "^IFCWALL$" },
      requirements: { attributes: [{ name: "Name", value: "Waldo", cardinality: "required" }], properties: [] } }] };
    expect(judgeModel(spec, [elem("IFCWALL", "Waldo")]).pass).toBe(true);
    expect(versionNotes(spec, "IFC4")).toEqual(["IFC2X3 walls: written for IFC2X3, the model is IFC4 — judged anyway (IDS 1.0: the version is metadata)"]);
    expect(versionNotes(spec, "IFC2X3")).toEqual([]);
  });
});
