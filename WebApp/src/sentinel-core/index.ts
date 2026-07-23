// sentinel-core — public surface. PURE TS (no OBC/DOM/THREE). The Fragments adapter
// lives under ./adapter and is the ONLY thing that imports the host engine.
export * from "./types";
export { RuleEngine } from "./rule-engine";
export { scan, type ScanContext } from "./scanner";
export { buildScorecard, type Scorecard, type DomainScore } from "./scorecard";
export {
  buildBoQ,
  resolveRate,
  describe,
  defaultRates,
  type ElementQuantities,
  type BoQ,
  type BoQLine,
  type RateTable,
  type RateRule,
  type Measure,
} from "./quantities";
export {
  defaultSequence,
  levelSequence,
  csvToSchedule,
  scheduleRange,
  type Task,
  type Schedule,
} from "./schedule";
export {
  GATE_DEFS,
  evaluateGate,
  type GateCheck,
  type GateMetrics,
  type GateResult,
  type Metric,
} from "./gates";
export {
  buildCarbon,
  resolveFactor,
  defaultFactors,
  type CarbonFactor,
  type CarbonFactors,
  type CarbonReport,
  type CarbonLine,
} from "./carbon";
export {
  diffSnapshots,
  snapshotFromQuantities,
  summarizeDiff,
  netDelta,
  type ElementSnapshot,
  type MeasureDelta,
  type ChangedElement,
  type RevisionDiff,
  type DiffSummary,
} from "./revision-diff";
export { priceSnapshot, costDiff, type DiffCost } from "./revision-cost";
export { carbonOfSnapshot, carbonDiff, type DiffCarbon } from "./revision-carbon";
export { toElementGraph, type ElementGraph, type ElementNode, type ElementComponents } from "./element-graph";
export {
  assess,
  toCobieCsv,
  missingFields,
  REQUIRED_FIELDS,
  type Asset,
  type CobieReport,
  type RequiredField,
} from "./cobie";

import rulesetJson from "./ruleset.json";
import type { Ruleset } from "./types";

/** The bundled BDS V1.4 ruleset (copied verbatim from the Revit plugin). */
export const bdsRuleset = rulesetJson as Ruleset;
export * from "./guideline";
