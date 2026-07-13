// sentinel-core — public surface. PURE TS (no OBC/DOM/THREE). The Fragments adapter
// lives under ./adapter and is the ONLY thing that imports the host engine.
export * from "./types";
export { RuleEngine } from "./rule-engine";
export { scan, type ScanContext } from "./scanner";
export { buildScorecard, type Scorecard, type DomainScore } from "./scorecard";

import rulesetJson from "./ruleset.json";
import type { Ruleset } from "./types";

/** The bundled BDS V1.4 ruleset (copied verbatim from the Revit plugin). */
export const bdsRuleset = rulesetJson as Ruleset;
