import { describe, it, expect } from "vitest";
import { loadTemplates, instantiateTemplate } from "./bimdocs-logic.mjs";
import { CHECKS, PLANNED_CHECKS } from "./check-registry.mjs";
import { readiness, readinessPlan, PILLARS, ANSWERS } from "./readiness-logic.mjs";

const tpl = () => loadTemplates().find((t) => t.doc_type === "READINESS");
const known = new Set([...CHECKS.map((c) => c.id), ...PLANNED_CHECKS.map((p) => p.id)]);

describe("readiness template", () => {
  it("has 30 items, each with a valid pillar and kind", () => {
    const t = tpl();
    expect(t.sections).toHaveLength(30);
    for (const s of t.sections) {
      expect(PILLARS).toContain(s.pillar);
      expect(["measured", "declared"]).toContain(s.kind);
      expect(s.heading.length).toBeGreaterThan(5);
    }
  });
  it("every measured item is pre-bound to a check the registry knows; every declared item asks a question", () => {
    for (const s of tpl().sections) {
      if (s.kind === "measured") {
        const ids = (s.bindings?.checks || []).map((c) => c.id);
        expect(ids.length).toBeGreaterThan(0);
        for (const id of ids) expect(known.has(id), `unknown check ${id} on "${s.heading}"`).toBe(true);
      } else {
        expect(typeof s.question).toBe("string");
        expect(s.bindings).toBeUndefined();
      }
    }
  });
  it("instantiateTemplate carries pillar/kind/question/bindings and starts unanswered, undated", () => {
    const doc = instantiateTemplate(tpl(), { title: "Aster readiness", actor: "t" });
    const m = doc.sections.find((s) => s.kind === "measured");
    const d = doc.sections.find((s) => s.kind === "declared");
    expect(m.bindings.checks[0].id).toBeTruthy();
    expect(m.pillar).toBeTruthy();
    expect(d.question).toBeTruthy();
    expect(d.answer).toBeNull();
    expect(d.due).toBeNull();
    expect(d.bindings).toEqual({});
  });
  it("BEP/EIR templates are untouched: no pillar, no kind, empty bindings", () => {
    const bep = instantiateTemplate(loadTemplates().find((t) => t.doc_type === "BEP"), {});
    expect(bep.sections[0].pillar).toBeUndefined();
    expect(bep.sections[0].kind).toBeUndefined();
    expect(bep.sections[0].bindings).toEqual({});
  });
});

const sec = (id, pillar, kind, extra = {}) => ({ id, heading: "H " + id, pillar, kind, owner: null, due: null, answer: null, bindings: {}, ...extra });
const R = (status, reason = "") => ({ id: "x", label: "x", status, count: 0, summary: "", reason, evidence: [] });

describe("readiness — three numbers, never one", () => {
  const doc = { sections: [
    sec("m1", "standards", "measured", { bindings: { checks: [{ id: "office.worksets" }] } }),
    sec("m2", "standards", "measured", { bindings: { checks: [{ id: "office.template_types" }] } }),
    sec("m3", "standards", "measured", { bindings: { checks: [{ id: "office.snapshot_present" }] } }),
    sec("m4", "process", "measured"),                                            // unbound → missing
    sec("d1", "people", "declared", { answer: { value: "yes", note: "", by: "a@x", at: "2026-09-17" } }),
    sec("d2", "people", "declared", { answer: { value: "partial", note: "some", by: "a@x", at: "2026-09-17" } }),
    sec("d3", "people", "declared"),                                             // unanswered → missing
  ] };
  const results = { m1: [R("met")], m2: [R("violations", "12 of 40 types do not match")], m3: [R("not_checkable", "no office snapshot received")] };

  it("counts measured by check verdict and declared by answer, separately", () => {
    const s = readiness(doc, results);
    expect(s.pillars.standards.measured).toMatchObject({ met: 1, violation: 1, not_checkable: 1, unbound: 0 });
    expect(s.pillars.process.measured).toMatchObject({ unbound: 1 });
    expect(s.pillars.people.declared).toMatchObject({ yes: 1, partial: 1, no: 0, unanswered: 1 });
    expect(s.overall.measured.met).toBe(1);
    expect(s.overall.declared.yes).toBe(1);
  });
  it("missing = unanswered declared + unbound measured; a declared yes never appears under measured", () => {
    const s = readiness(doc, results);
    expect(s.overall.missing.map((i) => i.section_id).sort()).toEqual(["d3", "m4"]);
    expect(s.overall.measured.items.map((i) => i.section_id)).not.toContain("d1");
  });
  it("every item carries its evidence: the check reason or the answer's author/date", () => {
    const s = readiness(doc, results);
    const m2 = s.overall.measured.items.find((i) => i.section_id === "m2");
    expect(m2.verdict).toBe("violation");
    expect(m2.reason).toMatch(/12 of 40/);
    const d1 = s.overall.declared.items.find((i) => i.section_id === "d1");
    expect(d1.verdict).toBe("yes");
    expect(d1.answer).toMatchObject({ by: "a@x", at: "2026-09-17" });
  });
  it("a check error is not_checkable with the error as reason; a section without a pillar is listed as unclassified, not scored", () => {
    const s = readiness({ sections: [sec("e1", "standards", "measured", { bindings: { checks: [{ id: "x" }] } }), sec("np", undefined, "measured", { bindings: { checks: [{ id: "x" }] } })] },
      { e1: [{ ...R("error"), summary: "Check failed: boom" }], np: [R("met")] });
    expect(s.pillars.standards.measured.not_checkable).toBe(1);
    expect(s.pillars.standards.measured.items[0].reason).toMatch(/boom/);
    expect(s.unclassified).toEqual(["np"]);
    expect(s.overall.measured.met).toBe(0);
  });
  it("exposes no single percentage", () => {
    const s = readiness(doc, results);
    expect(s.score).toBeUndefined();
    expect(s.overall.percent).toBeUndefined();
  });
});

describe("readinessPlan — derived, never stored", () => {
  const today = "2026-09-17";
  const doc = { sections: [
    sec("m1", "standards", "measured", { bindings: { checks: [{ id: "office.worksets" }] }, owner: "lead@x", due: "2026-09-10" }),
    sec("m2", "standards", "measured", { bindings: { checks: [{ id: "office.bep" }] }, owner: "lead@x", due: "2026-10-01" }),
    sec("d1", "people", "declared", { answer: { value: "no", note: "", by: "a@x", at: today } }),
    sec("d2", "people", "declared", { answer: { value: "yes", note: "", by: "a@x", at: today }, owner: "hr@x", due: "2026-08-01" }),
    sec("d3", "process", "declared", { answer: { value: "yes", note: "", by: "a@x", at: today } }),
  ] };
  const results = { m1: [R("violations", "2 missing")], m2: [R("met")] };
  it("lists failing/unanswered items and any item that had a plan; statuses open/overdue/closed", () => {
    const plan = readinessPlan(doc, readiness(doc, results), today);
    const by = Object.fromEntries(plan.map((r) => [r.section_id, r]));
    expect(by.m1.status).toBe("overdue");            // failing, due passed
    expect(by.m2.status).toBe("closed");             // now met, plan was set
    expect(by.d1.status).toBe("open");               // answered no, no due yet
    expect(by.d2.status).toBe("closed");             // yes now, plan existed
    expect(by.d3).toBeUndefined();                   // passing, never planned → not a plan row
  });
  it("says what closes each row", () => {
    const plan = readinessPlan(doc, readiness(doc, results), today);
    expect(plan.find((r) => r.section_id === "m1").closes_when).toMatch(/office\.worksets/);
    expect(plan.find((r) => r.section_id === "d1").closes_when).toMatch(/answer.*yes/i);
  });
});

describe("constants", () => {
  it("pillars and answers are the spec's", () => {
    expect(PILLARS).toEqual(["standards", "people", "process"]);
    expect(ANSWERS).toEqual(["yes", "partial", "no"]);
  });
});
