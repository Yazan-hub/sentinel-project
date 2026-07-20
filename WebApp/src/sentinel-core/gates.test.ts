import { describe, it, expect } from "vitest";
import { evaluateGate, GATE_DEFS, type GateMetrics } from "./gates";

const M = (over: Partial<GateMetrics> = {}): GateMetrics => ({
  health: null, compliance: null, blockViolations: 0, hardClashes: 0,
  openIssues: 0, openRfis: 0, hasStandardsPack: false, cobieComplete: null, ...over,
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
  it("a null metric is 'n/a' (non-blocking), not a failure", () => {
    const r = evaluateGate("design", M({ health: null, compliance: null, blockViolations: 0 }));
    expect(r.checks.find((c) => c.label.includes("health"))?.na).toBe(true);
    expect(r.pass).toBe(true); // only the enforceable check (blockViolations == 0) is evaluated
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
