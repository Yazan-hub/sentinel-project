// sentinel-core/scanner — evaluates a ruleset over ElementFacts, producing a ScanReport.
// This is the host-neutral replacement for C# RuleEngineHost.ScanFull + the per-target
// scanners (which called FilteredElementCollector). Same semantics, ElementFacts in.

import type {
  ElementFacts,
  EnforcementMode,
  Ruleset,
  ScanReport,
  Violation,
} from "./types";
import { SCHEMA_VERSION } from "./types";
import { RuleEngine } from "./rule-engine";

/** Injected so the pure core stays free of Date.now() at module scope (keeps it
 *  deterministic + testable). The adapter/panel passes real clock + title. */
export interface ScanContext {
  doc_title: string;
  now: string; // ISO 8601
}

export function scan(
  facts: ElementFacts[],
  ruleset: Ruleset,
  ctx: ScanContext,
): ScanReport {
  const started = performance.now();
  const engine = new RuleEngine();
  const violations: Violation[] = [];
  let checked = 0;

  // Index facts by target once — each rule scans only its own target's facts.
  const byTarget = new Map<string, ElementFacts[]>();
  for (const f of facts) {
    const list = byTarget.get(f.target) ?? [];
    list.push(f);
    byTarget.set(f.target, list);
  }

  for (const rule of ruleset.rules) {
    const scope = byTarget.get(rule.target) ?? [];

    if (rule.target === "workset") {
      // C# ScanWorksets: flag each present workset not in the whitelist, then flag
      // every whitelisted name that is MISSING from the model.
      const present = new Set<string>();
      for (const f of scope) {
        checked++;
        present.add(f.name);
        if (!(rule.whitelist ?? []).includes(f.name)) {
          const v = engine.checkName(rule, f.local_id, f.name);
          if (v) violations.push(v);
        }
      }
      for (const missing of rule.whitelist ?? []) {
        if (!present.has(missing)) {
          const v = engine.checkName(rule, -1, `(missing) ${missing}`);
          // checkName won't fail a whitelisted name; emit the missing marker directly.
          violations.push(
            v ?? {
              rule_id: rule.id,
              mode: rule.mode,
              element_id: -1,
              element_name: `(missing) ${missing}`,
              message_en: rule.message_en.replaceAll(
                "{name}",
                `(missing) ${missing}`,
              ),
              message_ar: rule.message_ar?.replaceAll(
                "{name}",
                `(missing) ${missing}`,
              ),
              doc_ref: rule.doc_ref,
            },
          );
        }
      }
      continue;
    }

    if (rule.target === "parameter") {
      // C# ScanParameter: for each in-scope element, the named param must be filled.
      for (const f of scope) {
        if (isExcluded(rule.exclusions, f.name)) continue;
        checked++;
        const value = rule.parameter_name
          ? f.params[rule.parameter_name]
          : undefined;
        const v = engine.checkParameter(
          rule,
          f.local_id,
          f.name,
          value,
          f.model_id,
        );
        if (v) violations.push(v);
      }
      continue;
    }

    if (rule.target === "family") {
      // C# ScanFamilies: scope to configured categories only (locale-safe on Revit;
      // on web the adapter already tags facts with IFC category).
      const cats = rule.categories ?? [];
      for (const f of scope) {
        if (cats.length > 0 && !cats.some((c) => matchesCategory(f, c)))
          continue;
        checked++;
        const v = engine.checkName(rule, f.local_id, f.name, f.model_id);
        if (v) violations.push(v);
      }
      continue;
    }

    // view / sheet / level / grid — plain name checks (C# ScanElements<T>).
    for (const f of scope) {
      checked++;
      const v = engine.checkName(rule, f.local_id, f.name, f.model_id);
      if (v) violations.push(v);
    }
  }

  return {
    schema_version: SCHEMA_VERSION,
    doc_title: ctx.doc_title,
    at: ctx.now,
    duration_ms: Math.round(performance.now() - started),
    elements_checked: checked,
    violations,
    score: flatScore(checked, violations),
  };
}

/** C# ScanReport.Score: monitor-mode findings are informational, excluded here. */
function flatScore(checked: number, violations: Violation[]): number {
  if (checked === 0) return 100;
  const scored = violations.filter(
    (v: Violation) => (v.mode as EnforcementMode) !== "monitor",
  ).length;
  return Math.max(0, (100 * (checked - scored)) / checked);
}

function isExcluded(exclusions: string[] | undefined, name: string): boolean {
  return (exclusions ?? []).some((x) => new RegExp(x).test(name));
}

/** Category match. On web the fact's category is an IFC entity ("IFCDOOR") or a
 *  friendly category ("Doors") the adapter mapped; match either loosely. */
function matchesCategory(f: ElementFacts, ruleCategory: string): boolean {
  const a = f.category.toLowerCase().replace(/[^a-z0-9]/g, "");
  const b = ruleCategory.toLowerCase().replace(/[^a-z0-9]/g, "");
  return a === b || a === `ifc${b}` || a.includes(b) || b.includes(a);
}
