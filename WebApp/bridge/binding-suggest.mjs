// Deterministic heading→check suggestion. No LLM: the mapping between a document section and a
// governance check is a small, stable, auditable vocabulary, and a wrong AI guess here would quietly
// bind a compliance claim to the wrong evidence. Suggestions are proposals only — the user confirms.
import { CHECKS, PLANNED_CHECKS } from "./check-registry.mjs";

/** term → weight. A section's score for a check is the sum of its matched terms' weights. */
const VOCAB = [
  { id: "naming.containers", terms: { "naming convention": 1.0, "container naming": 1.0, "file naming": 0.9, naming: 0.7, nomenclature: 0.7, "iso 19650": 0.3 } },
  { id: "cde.states", terms: { "container state": 1.0, "common data environment": 0.9, cde: 0.9, wip: 0.6, shared: 0.4, published: 0.5, workflow: 0.4, transition: 0.6 } },
  { id: "cde.suitability", terms: { suitability: 1.0, "suitability code": 1.0, "s0": 0.3, "status code": 0.7 } },
  { id: "cde.versioned", terms: { revision: 0.7, versioning: 0.9, "version control": 1.0 } },
  { id: "gate.stage", terms: { "stage gate": 1.0, "approval gate": 0.9, milestone: 0.4, "decision point": 0.6, "acceptance criteria": 0.7 } },
  { id: "project.standards_pack", terms: { "standards pack": 1.0, standard: 0.5, "methods and procedures": 0.6 } },
  { id: "ids.last_verdict", terms: { "acceptance criteria": 0.8, "data completeness": 0.7, ids: 0.8, "quality assurance": 0.6, "model checking": 0.7, "checks before": 0.6 } },
  // Planned gaps — suggesting one makes a section honestly report "not checkable, and here is why".
  { id: "midp.milestones", terms: { "delivery milestone": 1.0, midp: 1.0, tidp: 1.0, "delivery date": 0.9, "information delivery": 0.7, milestone: 0.6 } },
  { id: "loin.levels", terms: { "level of information need": 1.0, loin: 1.0, "level of detail": 0.9, lod: 0.8, "geometric": 0.4 } },
  { id: "roles.responsibility", terms: { responsibilit: 1.0, roles: 0.9, raci: 1.0, "task team": 0.9, "appointing party": 0.7, authorities: 0.5 } },
  { id: "qa.scorecard", terms: { "model health": 1.0, scorecard: 1.0, "quality assurance": 0.7, "qa check": 0.8 } },
  { id: "federation.breakdown", terms: { federation: 1.0, "model breakdown": 1.0, "how models are split": 0.9, clash: 0.5 } },
];

// Word-boundary matching: a term matches only when not glued to another alphanumeric char on
// either side, so "ids" hits "the IDS spec" / "(IDS)" / "MIDP/TIDP" but not "grids" or "provides".
// Plain substring would false-positive short acronym terms inside unrelated words.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Trailing "s?" tolerates a plain plural ("approval gates" still matches "approval gate") without
// reopening the acronym hole: the left-side boundary already blocks "grids" from matching "ids".
const termRegex = (term) => new RegExp(`(?<![a-z0-9])${escapeRegex(term)}s?(?![a-z0-9])`, "i");
const TERM_RE = new Map(VOCAB.flatMap((e) => Object.keys(e.terms)).map((term) => [term, termRegex(term)]));

const PLANNED_IDS = new Set(PLANNED_CHECKS.map((p) => p.id));
const LABELS = new Map([...CHECKS.map((c) => [c.id, c.label]), ...PLANNED_CHECKS.map((p) => [p.id, p.label])]);
const MIN_CONFIDENCE = 0.7; // below this a match is noise (a bare "shared" or "standard" mention)

/** Default params worth pre-filling so an accepted suggestion is immediately meaningful. */
const DEFAULT_PARAMS = {
  "cde.states": { expect: ["published"] },
  "cde.suitability": { allowed: ["S3", "S4"] },
};

/**
 * Propose bindings for each section. Returns EVERY section (an empty `suggested` is a valid, honest
 * answer), each suggestion carrying the terms that triggered it so the user can judge it.
 */
export function suggestBindings(sections) {
  return (sections || []).map((s) => {
    const hay = `${s.heading || ""} ${s.guidance || ""}`.toLowerCase();
    const hits = [];
    for (const entry of VOCAB) {
      let score = 0;
      const matched = [];
      for (const [term, weight] of Object.entries(entry.terms)) {
        if (TERM_RE.get(term).test(hay)) { score += weight; matched.push(term); }
      }
      if (score >= MIN_CONFIDENCE) {
        hits.push({
          id: entry.id,
          label: LABELS.get(entry.id) || entry.id,
          params: DEFAULT_PARAMS[entry.id] || {},
          confidence: Math.min(1, Number(score.toFixed(2))),
          why: `matched: ${matched.join(", ")}`,
          planned: PLANNED_IDS.has(entry.id),
        });
      }
    }
    hits.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
    return { section_id: s.id, heading: s.heading, suggested: hits };
  });
}
