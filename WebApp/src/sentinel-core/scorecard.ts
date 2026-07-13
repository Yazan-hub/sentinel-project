// sentinel-core/scorecard — severity-weighted executive score. Direct port of
// C# Engine/HealthScorecard.cs. Pure computation; feed it any ScanReport.

import type { EnforcementMode, ScanReport } from "./types";

function weight(m: EnforcementMode): number {
  switch (m) {
    case "block":
      return 8.0;
    case "request":
      return 4.0;
    case "warn":
      return 2.0;
    default:
      return 0.5; // monitor: informational, near-free
  }
}

export interface DomainScore {
  domain: string; // rule-id prefix: VN, SN, WS, FN, IFC…
  violations: number;
  weighted_penalty: number;
}

export interface Scorecard {
  doc_title: string;
  at: string;
  elements_checked: number;
  total_violations: number;
  score: number; // weighted 0-100
  grade: string; // A–F
  domains: DomainScore[];
  headline: string;
}

function gradeFor(score: number): string {
  return score >= 95
    ? "A"
    : score >= 85
      ? "B"
      : score >= 70
        ? "C"
        : score >= 50
          ? "D"
          : "F";
}

export function buildScorecard(report: ScanReport): Scorecard {
  let penalty = 0;
  const byDomain = new Map<string, DomainScore>();

  for (const v of report.violations) {
    const w = weight(v.mode);
    penalty += w;
    const key = v.rule_id.split("-")[0];
    let d = byDomain.get(key);
    if (!d) {
      d = { domain: key, violations: 0, weighted_penalty: 0 };
      byDomain.set(key, d);
    }
    d.violations++;
    d.weighted_penalty += w;
  }

  // Normalize against an all-WARN worst case; clamp at 0 (elements can carry >1
  // violation). Mirrors C# HealthScorecard.Build.
  const maxPenalty = Math.max(1, report.elements_checked) * weight("warn");
  const score = Math.max(0, 100 * (1 - penalty / maxPenalty));

  const domains = [...byDomain.values()].sort(
    (a, b) => b.weighted_penalty - a.weighted_penalty,
  );
  const grade = gradeFor(score);

  return {
    doc_title: report.doc_title,
    at: report.at,
    elements_checked: report.elements_checked,
    total_violations: report.violations.length,
    score,
    grade,
    domains,
    headline: `${score.toFixed(1)}% (${grade}) — ${report.violations.length} open issue(s) across ${domains.length} domain(s)`,
  };
}
