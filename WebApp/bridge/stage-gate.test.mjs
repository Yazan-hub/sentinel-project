// The bridge's stage gate (cohesion phase 5c, spec Decision 10): measureGate is pure over the four inputs the bridge can
// read; a metric with no server source is n/a and makes the gate not_checkable, never a pass; every check names its
// source. readGateInputs runs over injected stores — no Supabase.
import { describe, it, expect, vi } from "vitest";
import { measureGate, readGateInputs, NO_SERVER_SOURCE } from "./stage-gate.mjs";
import { STAGES } from "./cde-store.mjs";

const ALL = { hasStandardsPack: true, openIssues: 0, openRfis: 0, hardClashes: 0 };

describe("measureGate — pure, never a pass on an unmeasured metric", () => {
  it("tender passes on the ruleset artefact alone and names it; without one it holds", () => {
    expect(measureGate("tender", ALL)).toEqual({ stage: "tender", status: "pass", next_stage: "design",
      checks: [{ label: "Standards pack selected", ok: true, na: false, detail: "set", source: "ruleset artefact" }] });
    expect(measureGate("tender", { ...ALL, hasStandardsPack: false })).toMatchObject({ status: "hold", checks: [{ ok: false, na: false, detail: "none", source: "ruleset artefact" }] });
  });
  it("design is not checkable — health, block violations and compliance have no server source, whatever the inputs", () => {
    const g = measureGate("design", ALL);
    expect(g.status).toBe("not_checkable");
    expect(g.next_stage).toBe("coord");
    expect(g.checks.map((c) => [c.label, c.na, c.source])).toEqual([
      ["Model health ≥ 80%", true, NO_SERVER_SOURCE],
      ["No 'block' violations", true, NO_SERVER_SOURCE],
      ["Standards compliance ≥ 70%", true, NO_SERVER_SOURCE],
    ]);
  });
  it("coord: a measured failure holds the gate even beside an unmeasured check; the counted checks name their stores", () => {
    const g = measureGate("coord", { ...ALL, hardClashes: 3 });
    expect(g.status).toBe("hold");
    expect(g.checks.map((c) => [c.label, c.ok, c.na, c.detail, c.source])).toEqual([
      ["No open hard clashes", false, false, "3", "clash store"],
      ["Model health ≥ 85%", false, true, "no data", NO_SERVER_SOURCE],
      ["No open RFIs", true, false, "0", "RFI store"],
    ]);
  });
  it("a count the caller could not read (null, or not a number) is n/a with its store named — never a zero", () => {
    const g = measureGate("hand", { ...ALL, openRfis: null, openIssues: "2" });
    expect(g.status).toBe("not_checkable");
    expect(g.checks.map((c) => [c.na, c.source])).toEqual([
      [true, "not measured — RFI store not read"],
      [true, "not measured — BCF topics (bcf-store) not read"],
      [true, NO_SERVER_SOURCE],
    ]);
  });
  it("constr counts the open BCF topics; oper has no gate and no next stage; the stage order is the store's", () => {
    expect(measureGate("constr", { ...ALL, openIssues: 2 })).toMatchObject({ status: "hold", next_stage: "hand",
      checks: [{ label: "All coordination issues closed", ok: false, na: false, detail: "2", source: "BCF topics (bcf-store)" }, { na: true, source: NO_SERVER_SOURCE }] });
    expect(measureGate("oper", ALL)).toEqual({ stage: "oper", status: "pass", checks: [], next_stage: null });
    expect(STAGES).toEqual(["tender", "design", "coord", "constr", "hand", "oper"]);
  });
});

describe("readGateInputs — the four inputs, each from a store scoped by the project key", () => {
  const deps = (over = {}) => ({
    resolveArtefact: vi.fn(async () => ({ body: { rules: [] }, source: "office", ref: "ruleset@1", sha256: "ab".repeat(32), pointer_sha_mismatch: false })),
    bcfListTopics: vi.fn(async () => [{ topic_status: "Open" }, { topic_status: "In Progress" }, { topic_status: "Resolved" }, { topic_status: "Closed" }, { topic_status: " closed " }]),
    docList: vi.fn(async (store) => (store === "rfi"
      ? [{ status: "Open" }, { status: "Answered" }, { status: "Closed" }]
      : [{ status: "raised" }, { status: "reviewed" }, { status: "approved" }, { status: "resolved" }])),
    ...over,
  });
  it("counts open topics (not Closed/Resolved), open RFIs (not Closed) and unresolved clashes; the ruleset from the resolver", async () => {
    const d = deps();
    expect(await readGateInputs("aster-tower", d)).toEqual({ hasStandardsPack: true, openIssues: 2, openRfis: 2, hardClashes: 3 });
    expect(d.resolveArtefact).toHaveBeenCalledWith("aster-tower", "ruleset");
    expect(d.bcfListTopics).toHaveBeenCalledWith("aster-tower", { status: "all" });
    expect(d.docList.mock.calls).toEqual([["rfi", "aster-tower"], ["clash", "aster-tower"]]);
  });
  it("no ruleset installed is false; empty stores are zero — measured as empty, not unread", async () => {
    const d = deps({ resolveArtefact: async () => ({ body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false }), bcfListTopics: async () => [], docList: async () => [] });
    expect(await readGateInputs("aster-villa", d)).toEqual({ hasStandardsPack: false, openIssues: 0, openRfis: 0, hardClashes: 0 });
  });
  it("a store that cannot be read fails the run — it never counts as zero", async () => {
    const d = deps({ docList: async (store) => { if (store === "clash") throw new Error("Supabase 500: boom"); return []; } });
    await expect(readGateInputs("aster-tower", d)).rejects.toThrow("Supabase 500: boom");
  });
});
