import { describe, it, expect } from "vitest";
import { evaluateGate, GATE_DEFS, type GateMetrics } from "./gates";

const M = (over: Partial<GateMetrics> = {}): GateMetrics => ({
  health: null, compliance: null, blockViolations: 0, hardClashes: 0,
  openIssues: 0, openRfis: 0, hasStandardsPack: false, cobieComplete: null, lodState: 100, ...over,
});

describe("the design gate's LOD state (MA-2b, design §3.2: the share at the DD row's LOD)", () => {
  const met = { health: 85, compliance: 75, blockViolations: 0 };
  it("not measured until a lod_state row exists — the gate is not checkable, never a pass", () => {
    const r = evaluateGate("design", M({ ...met, lodState: null }));
    expect(r.checks[r.checks.length - 1]).toEqual({ label: "LOD state: elements at the DD row ≥ 90%", ok: false, na: true, detail: "no data" });
    expect(r.status).toBe("not_checkable");
  });
  it("a measured share below the bar holds the gate; at or above it, the check is met", () => {
    expect(evaluateGate("design", M({ ...met, lodState: 89 })).status).toBe("hold");
    const met90 = evaluateGate("design", M({ ...met, lodState: 90 })).checks; // no .at(): the web's tsconfig lib is before es2022
    expect(met90[met90.length - 1]).toMatchObject({ ok: true, na: false, detail: "90" });
  });
});

describe("evaluateGate", () => {
  it("design gate passes when health/compliance meet the bar and no block violations", () => {
    expect(evaluateGate("design", M({ health: 85, compliance: 75, blockViolations: 0 })).pass).toBe(true);
  });
  it("design gate fails on low health", () => {
    const r = evaluateGate("design", M({ health: 70, compliance: 75 }));
    expect(r.pass).toBe(false);
    expect(r.checks.find((c) => c.label.includes("health"))?.ok).toBe(false);
  });
  it("a null metric is 'n/a' and makes the gate not checkable — never a pass on unmeasured data", () => {
    const r = evaluateGate("design", M({ health: null, compliance: 80, blockViolations: 0 }));
    expect(r.checks.find((c) => c.label.includes("health"))?.na).toBe(true);
    expect(r.status).toBe("not_checkable");
    expect(r.pass).toBe(false);
  });
  it("a failing measured check wins over an unmeasured one — hold, not not_checkable", () => {
    const r = evaluateGate("design", M({ health: null, compliance: 50, blockViolations: 0 }));
    expect(r.status).toBe("hold");
    expect(r.pass).toBe(false);
  });
  it("a null count is 'n/a' too — an unposted count is never 'no open issues'", () => {
    const r = evaluateGate("constr", M({ openIssues: null, health: 95 }));
    expect(r.checks.find((c) => c.label.includes("coordination issues"))?.na).toBe(true);
    expect(r.status).toBe("not_checkable");
    expect(r.pass).toBe(false);
  });
  it("null hard clashes, RFIs and block violations each make their gate not checkable, never a pass", () => {
    expect(evaluateGate("coord", M({ hardClashes: null, health: 90, openRfis: 0 })).status).toBe("not_checkable");
    expect(evaluateGate("coord", M({ hardClashes: 0, health: 90, openRfis: null })).status).toBe("not_checkable");
    expect(evaluateGate("design", M({ health: 85, compliance: 75, blockViolations: null })).status).toBe("not_checkable");
  });
  it("a null count never hides a measured failure — hold wins", () => {
    expect(evaluateGate("coord", M({ hardClashes: 3, health: 90, openRfis: null })).status).toBe("hold");
  });
  it("every check measured and met → pass", () => {
    expect(evaluateGate("design", M({ health: 85, compliance: 75, blockViolations: 0 })).status).toBe("pass");
  });
  it("tender gate keys off the standards-pack exists check", () => {
    expect(evaluateGate("tender", M({ hasStandardsPack: false })).pass).toBe(false);
    expect(evaluateGate("tender", M({ hasStandardsPack: true })).pass).toBe(true);
  });
  it("coord gate blocks on open hard clashes", () => {
    expect(evaluateGate("coord", M({ hardClashes: 0, health: 90, openRfis: 0 })).pass).toBe(true);
    expect(evaluateGate("coord", M({ hardClashes: 3, health: 90, openRfis: 0 })).pass).toBe(false);
  });
  it("an unknown/terminal stage has no gate → passes vacuously", () => {
    expect(evaluateGate("oper", M()).pass).toBe(true);
    expect(GATE_DEFS.oper).toBeUndefined();
  });
});

describe("a standards pack not read is not measured — never 'none' and HOLD", () => {
  it("null (the read has not answered, or failed) is n/a with 'not read'", () => {
    const r = evaluateGate("tender", M({ hasStandardsPack: null }));
    const row = r.checks.find((c) => c.label === "Standards pack selected")!;
    expect(row).toMatchObject({ ok: false, na: true, detail: "not read" });
    expect(r.pass).toBe(false);
  });
});
