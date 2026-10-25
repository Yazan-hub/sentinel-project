import { describe, it, expect, vi } from "vitest";

vi.mock("../setups/bridge-fetch", () => ({ bfetch: vi.fn() }));

import { READ_ONLY_NOTE, renderReadiness } from "./readiness-view";
import { fakeDocument, findAll, textOf } from "./fake-dom";

const pillar = (o: Record<string, unknown> = {}) => ({ measured: { met: 0, violation: 0, not_checkable: 0, unbound: 0, items: [] }, declared: { yes: 0, partial: 0, no: 0, unanswered: 0, items: [] }, missing: [], ...o });
const doc = { id: "r", doc_type: "READINESS", title: "SNW Office readiness (tender)", status: "wip", sections: [
  { id: "r1", heading: "1. Office snapshot received", kind: "measured", answer: null, due: null },
  { id: "r2", heading: "12. Training plan", kind: "declared", question: "Is there a training plan?", answer: { value: "partial", note: "Half the team" }, due: "2026-12-01" },
  { id: "r3", heading: "13. Competence", kind: "declared", question: "Are competences recorded?", answer: null, due: null }] } as any;

describe("renderReadiness", () => {
  it("shows the three numbers per pillar and every answer in words, with no control", () => {
    const rep = { score: { pillars: { standards: pillar({ measured: { met: 3, violation: 1, not_checkable: 0, unbound: 0, items: [] }, declared: { yes: 1, partial: 1, no: 0, unanswered: 2, items: [] }, missing: [{}, {}] }), people: pillar(), process: pillar() } } };
    const el = renderReadiness(doc, rep, fakeDocument());
    const t = textOf(el);
    for (const s of [READ_ONLY_NOTE.READINESS, "Standards: Measured 3 met, 1 violation, 0 not checkable · Declared 1 yes, 1 partly, 0 no · 2 missing",
      "Is there a training plan?", "Partly: Half the team", "Due 2026-12-01", "Not answered", "No due date"]) expect(t).toContain(s);
    for (const tag of ["button", "input", "textarea", "select"]) expect(findAll(el, tag)).toHaveLength(0);
  });
  it("still lists the questions when the report could not be read", () => {
    const t = textOf(renderReadiness(doc, "nope", fakeDocument()));
    expect(t).toContain("Readiness could not be computed; the questions are shown below.");
    expect(t).toContain("Are competences recorded?");
  });
  it("words the TIDP note", () => expect(READ_ONLY_NOTE.TIDP).toBe("Old task team plans are read here; plan deliveries in Deliverables."));
});
