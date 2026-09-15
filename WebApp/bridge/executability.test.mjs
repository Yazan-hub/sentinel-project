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
