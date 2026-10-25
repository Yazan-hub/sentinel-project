import { describe, it, expect } from "vitest";
import { classifySection, executability } from "./executability.mjs";

const IMPL = ["naming.containers", "cde.states"];
const PLAN = ["roles.responsibility", "midp.review"];
const sec = (id, heading, checks = [], extra = {}) => ({
  id, heading, body: "text", owner: "yazan", state: "wip",
  bindings: checks.length ? { checks: checks.map((c) => ({ id: c, params: {} })) } : {},
  ...extra,
});
const run = (sections) => executability({ id: "d1", title: "BEP", doc_type: "bep", sections }, IMPL, PLAN);

describe("classifySection", () => {
  const impl = new Set(IMPL), plan = new Set(PLAN);
  it("a live binding makes a clause controlling", () => {
    expect(classifySection(sec("s", "Naming", ["naming.containers"]), impl, plan).kind).toBe("controlling");
  });
  it("a planned-only binding is declared, not controlling", () => {
    const r = classifySection(sec("s", "Roles", ["roles.responsibility"]), impl, plan);
    expect(r.kind).toBe("declared");
    expect(r.controlling_checks).toEqual([]);
    expect(r.declared_checks).toEqual(["roles.responsibility"]);
  });
  it("an unbound clause is narrative", () => {
    expect(classifySection(sec("s", "Software list"), impl, plan).kind).toBe("narrative");
  });
  it("one live check outranks any number of planned ones", () => {
    expect(classifySection(sec("s", "Mixed", ["roles.responsibility", "cde.states"]), impl, plan).kind).toBe("controlling");
  });
  it("an unrecognised id is reported, never counted", () => {
    const r = classifySection(sec("s", "Odd", ["made.up"]), impl, plan);
    expect(r.kind).toBe("narrative");
    expect(r.unknown_checks).toEqual(["made.up"]);
  });
});

describe("executability", () => {
  it("scores only controlling clauses", () => {
    const r = run([
      sec("a", "Naming", ["naming.containers"]),
      sec("b", "States", ["cde.states"]),
      sec("c", "Roles", ["roles.responsibility"]),
      sec("d", "Software list"),
    ]);
    expect(r.summary).toMatchObject({ sections: 4, controlling: 2, declared: 1, narrative: 1 });
    expect(r.score).toBe(50); // declared is NOT added — 2/4, not 3/4
  });
  it("lists exactly what the strip test removes", () => {
    const r = run([sec("a", "Naming", ["naming.containers"]), sec("b", "Org chart"), sec("c", "CDE screenshots")]);
    expect(r.strip).toEqual(["Org chart", "CDE screenshots"]);
  });
  it("counts unowned and empty clauses", () => {
    const r = run([sec("a", "A", [], { owner: null, body: "" }), sec("b", "B", ["cde.states"])]);
    expect(r.summary.unowned).toBe(1);
    expect(r.summary.empty).toBe(1);
  });
  it("an empty document scores null with a reason, never 0 or 100", () => {
    const r = run([]);
    expect(r.score).toBeNull();
    expect(r.reason).toMatch(/no sections/i);
  });
  it("a fully wired document scores 100", () => {
    expect(run([sec("a", "A", ["naming.containers"]), sec("b", "B", ["cde.states"])]).score).toBe(100);
  });
});

describe("R1b: the honest score (spec section 8)", () => {
  it("a section bound to a live check but not written is declared, never controlling", () => {
    const r = run([sec("a", "Naming", ["naming.containers"], { body: "" })]);
    expect(r.sections[0]).toMatchObject({ kind: "declared", written: false }); expect(r.score).toBe(0);
  });
  it("the headline, exactly", () => {
    const r = run([...[1, 2, 3, 4].map((i) => sec(`c${i}`, `C${i}`, ["cde.states"])), sec("n1", "N1"), sec("n2", "N2"),
      ...[1, 2, 3, 4].map((i) => sec(`e${i}`, `E${i}`, i % 2 ? ["naming.containers"] : [], { body: "" }))]);
    expect(r.summary).toMatchObject({ sections: 10, controlling: 4, declared: 2, written: 6 });
    expect(r.headline).toBe("40 % controlling, 6 of 10 sections written");
  });
  it("a section holding only a live list is not written", () => {
    const r = run([sec("a", "MIDP", ["midp.review"], { body: undefined, blocks: [{ id: "l", kind: "live_view", title: "", data: { source: "midp", filter: { team: null, stage: null, register_part: null } } }] })]);
    expect(r.summary.written).toBe(0);
  });
  it("bindings.checks that is not a list does not throw", () =>
    expect(run([sec("a", "A", [], { bindings: { checks: { id: "cde.states" } } })]).sections[0].kind).toBe("narrative"));
  it("no sections: the reason is the headline", () => { const r = run([]); expect(r.headline).toBe(r.reason); });
  it("a null entry in sections does not throw", () => expect(() => run([null, sec("a", "A")])).not.toThrow());
});
