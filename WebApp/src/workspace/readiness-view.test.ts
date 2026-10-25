import { describe, it, expect, vi } from "vitest";

vi.mock("../setups/bridge-fetch", () => ({ bfetch: vi.fn() }));

import { READ_ONLY_NOTE, readinessView, renderReadiness } from "./readiness-view";
import { emptyState } from "./workspace-state";
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

describe("renderReadiness, odd and partial input", () => {
  const one = (section: Record<string, unknown>) => ({ ...doc, sections: [section] });
  it("shows a measured section's due date, without a question or an answer line", () => {
    const t = textOf(renderReadiness(one({ id: "m", heading: "1. Snapshot", kind: "measured", question: "Q?", answer: null, due: "2026-11-01" }), "x", fakeDocument()));
    expect(t).toContain("Due 2026-11-01");
    expect(t).not.toContain("Not answered");
    expect(t).not.toContain("Q?");
    expect(textOf(renderReadiness(one({ id: "m", heading: "1. Snapshot", kind: "measured", answer: null, due: null }), "x", fakeDocument()))).toContain("No due date");
  });
  it("reads an answer without a usable value as not answered, keeping its note", () => {
    const t = textOf(renderReadiness(one({ id: "d", heading: "2. X", kind: "declared", answer: { note: "Half" }, due: null }), "x", fakeDocument()));
    expect(t).toContain("Not answered: Half");
    expect(t).not.toContain("undefined");
  });
  it("says a pillar the report leaves out is not reported", () => {
    const t = textOf(renderReadiness(doc, { score: { pillars: { standards: pillar(), people: pillar() } } }, fakeDocument()));
    expect(t).toContain("Process: not reported");
    expect(t).toContain("People: Measured 0 met");
  });
});

describe("readinessView", () => {
  const live = (st: any, get: any) => ({ st, ws: { state: () => st, get }, doc: fakeDocument() }) as any;
  const tick = () => new Promise((res) => setTimeout(res, 0));
  it("reads this document's report and renders it", async () => {
    const st = { ...emptyState("k"), doc };
    const get = vi.fn(async () => ({ score: { pillars: { standards: pillar(), people: pillar(), process: pillar() } } }));
    const el = readinessView(live(st, get));
    expect(textOf(el)).toContain("Computing readiness");
    await tick();
    expect(get).toHaveBeenCalledWith("/bimdocs/k/r/readiness");
    expect(textOf(el)).toContain("Standards: Measured 0 met");
  });
  it("shows nothing when the project changed while it read", async () => {
    const st = { ...emptyState("k"), doc }, now = { ...st };
    const el = readinessView(live(now, vi.fn(async () => { now.key = "other"; return {}; })));
    await tick();
    expect(textOf(el)).toContain("Computing readiness");
    expect(textOf(el)).not.toContain("Standards");
  });
});
