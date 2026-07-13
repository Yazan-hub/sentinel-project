// sentinel-core/types — the wire format. PURE TS: no OBC, no DOM, no THREE.
// Ported from the C# plugin (Engine/RuleModels.cs). Field names kept snake_case to
// stay byte-compatible with the existing ruleset.json, the Postgres jsonb columns,
// and any future Revit<->web interchange. Freeze these with schema_version (roadmap
// Phase 3, Rule 2 — the wire format IS the product).

export const SCHEMA_VERSION = 1;

/** The enforcement ladder (Decision 4). Order matters: monitor < warn < request < block. */
export type EnforcementMode = "monitor" | "warn" | "request" | "block";

/** What a rule scans. Note: workset/view/sheet are Revit-authoring concepts that do
 *  NOT survive IFC export — on the web the adapter yields 0 facts for them and the UI
 *  reports them as authoring-side only. family/level/grid/parameter map to IFC. */
export type RuleTarget =
  | "view"
  | "sheet"
  | "workset"
  | "family"
  | "level"
  | "grid"
  | "parameter";

/** Token-based rule (Decision 9): authored rules carry tokens + token_defs, never raw
 *  regex. Tokens compile to an anchored regex internally (see rule-engine.ts). */
export interface Rule {
  id: string; // "VN-01"
  target: RuleTarget;
  mode: EnforcementMode;
  tokens?: string[]; // ["PREFIX","BODY"]
  token_defs?: Record<string, string>; // { PREFIX: "WIP|SH|...", ... }
  separator?: string; // default "_"
  whitelist?: string[]; // exact-match allowlist
  exclusions?: string[]; // regex list of names to skip
  parameter_name?: string; // for target === "parameter"
  categories?: string[]; // family/element category scope
  message_en: string; // may contain "{name}"
  message_ar?: string;
  doc_ref?: string; // "BDS-RTG-001 §5"
}

export interface Ruleset {
  standard_key: string;
  semver: string;
  rules: Rule[];
}

export interface Violation {
  rule_id: string;
  mode: EnforcementMode;
  element_id: number; // adapter-local id; -1 for worksets / non-element targets
  element_name: string;
  message_en: string;
  message_ar?: string;
  doc_ref?: string;
  /** Host model this element belongs to. Set by the adapter/scanner so the UI can
   *  build a ModelIdMap and isolate/zoom the offender. Absent for non-element
   *  targets (worksets, missing-workset markers). Schema stays v1 — additive. */
  model_id?: string;
}

export interface ScanReport {
  schema_version: number;
  doc_title: string;
  at: string; // ISO 8601
  duration_ms: number;
  elements_checked: number;
  violations: Violation[];
  /** Flat count ratio, monitor-mode excluded (mirrors C# ScanReport.Score). See
   *  scorecard.ts for the severity-weighted executive score. */
  score: number;
}

/**
 * The adapter boundary (roadmap Phase 3, Rule 2). In Revit it's fed by collectors;
 * on the web it's fed by Fragments/IFC via OBC. The engine only ever sees ElementFacts —
 * it never imports a host API. This is the single seam that makes the core portable.
 */
export interface ElementFacts {
  /** Stable identity: IFC GlobalId on web, ElementId on Revit. */
  guid: string;
  /** Adapter-local numeric id for host round-trips (isolate/select). */
  local_id: number;
  /** Host model id this element lives in (Fragments modelId on web). Lets the
   *  scanner stamp Violations so the UI can isolate/zoom the offender. */
  model_id?: string;
  /** Which rule target this fact answers to. */
  target: RuleTarget;
  /** IFC entity ("IFCDOOR") on web, category name on Revit. */
  category: string;
  type_name?: string;
  /** The name the naming rules check (element name, sheet number, level name…). */
  name: string;
  /** Flattened property/pset values, keyed by property name. */
  params: Record<string, string>;
}
