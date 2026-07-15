// sentinel-core/gates — PURE stage-gate definitions + evaluator (no OBC/DOM). Generalizes the
// Phase-1 delivery gate: every lifecycle boundary has a declarative list of checks, each a boolean
// over a computed metric. The project shell feeds live metrics; the engine says pass/hold and why.
// "Standards-as-code at every boundary" — the same idea as the IFC delivery gate, everywhere.

export type Metric =
  | "health" | "compliance" | "blockViolations" | "hardClashes"
  | "openIssues" | "openRfis" | "hasStandardsPack" | "cobieComplete";

export interface GateCheck {
  metric: Metric;
  op: ">=" | "<=" | "==" | "exists";
  value?: number;
  label: string;
}

/** Live values the shell computes; null = not measurable yet (→ the check is "n/a", non-blocking). */
export interface GateMetrics {
  health: number | null;
  compliance: number | null;
  blockViolations: number;
  hardClashes: number;
  openIssues: number;
  openRfis: number;
  hasStandardsPack: boolean;
  cobieComplete: number | null; // 7D handover readiness % (from the project snapshot)
}

export interface EvaluatedCheck { label: string; ok: boolean; na: boolean; detail: string; }
export interface GateResult { checks: EvaluatedCheck[]; pass: boolean; }

/** Keyed by the CURRENT stage — the gate you must pass to leave it. `oper` is terminal (no gate). */
export const GATE_DEFS: Record<string, GateCheck[]> = {
  tender: [
    { metric: "hasStandardsPack", op: "exists", label: "Standards pack selected" },
  ],
  design: [
    { metric: "health", op: ">=", value: 80, label: "Model health ≥ 80%" },
    { metric: "blockViolations", op: "==", value: 0, label: "No 'block' violations" },
    { metric: "compliance", op: ">=", value: 70, label: "Standards compliance ≥ 70%" },
  ],
  coord: [
    { metric: "hardClashes", op: "==", value: 0, label: "No open hard clashes" },
    { metric: "health", op: ">=", value: 85, label: "Model health ≥ 85%" },
    { metric: "openRfis", op: "==", value: 0, label: "No open RFIs" },
  ],
  constr: [
    { metric: "openIssues", op: "==", value: 0, label: "All coordination issues closed" },
    { metric: "health", op: ">=", value: 90, label: "Model health ≥ 90%" },
  ],
  hand: [
    { metric: "openRfis", op: "==", value: 0, label: "All RFIs answered/closed" },
    { metric: "openIssues", op: "==", value: 0, label: "All issues closed" },
    { metric: "cobieComplete", op: ">=", value: 95, label: "COBie / asset data ≥ 95% complete" },
  ],
};

export function evaluateGate(stage: string, m: GateMetrics): GateResult {
  const defs = GATE_DEFS[stage] ?? [];
  const checks: EvaluatedCheck[] = defs.map((c) => {
    if (c.metric === "hasStandardsPack") {
      return { label: c.label, ok: m.hasStandardsPack, na: false, detail: m.hasStandardsPack ? "set" : "none" };
    }
    const v = m[c.metric] as number | null;
    if (v == null) return { label: c.label, ok: false, na: true, detail: "no data" };
    let ok = false;
    if (c.op === ">=") ok = v >= (c.value ?? 0);
    else if (c.op === "<=") ok = v <= (c.value ?? 0);
    else if (c.op === "==") ok = v === (c.value ?? 0);
    return { label: c.label, ok, na: false, detail: String(Math.round(v)) };
  });
  const enforceable = checks.filter((c) => !c.na);
  const pass = enforceable.length === 0 ? true : enforceable.every((c) => c.ok);
  return { checks, pass };
}
