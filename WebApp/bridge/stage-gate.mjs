// The stage gate, measured on the bridge (cohesion phase 5c, spec 2026-09-26 Decision 10). The gate's inputs are read
// from what the bridge holds — the ruleset artefact, the BCF topic store, the RFI store and the clash store — and judged
// by the same evaluateGate the browser bundles (sentinel-core.mjs). Health, compliance, block violations and COBie
// completeness have no server source (the browser scan is not persisted), so a gate that needs one is not_checkable: it
// never passes on a number nobody measured, and every check names what was read. measureGate is pure; readGateInputs is
// the thin I/O half with its deps injected (the artefact-store idiom), so the tests never touch Supabase.
import { evaluateGate, GATE_DEFS } from "./sentinel-core.mjs";
import { STAGES } from "./cde-store.mjs";

export const NO_SERVER_SOURCE = "not measured — no server source: the browser scan is not persisted";
const SOURCE = { hasStandardsPack: "ruleset artefact", openIssues: "BCF topics (bcf-store)", openRfis: "RFI store", hardClashes: "clash store" };
const count = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Judge `stage` on inputs = {hasStandardsPack, openIssues, openRfis, hardClashes}; a count is a finite number, or null
 *  = not read (a string or NaN is not read either — never a zero nobody counted). Health, compliance, block violations
 *  and COBie are null here by construction. Returns {stage, status: pass | hold | not_checkable, checks: [{label, ok, na,
 *  detail, source}], next_stage} — next_stage is null on the last stage. */
export function measureGate(stage, inputs = {}) {
  const m = {
    health: null, compliance: null, blockViolations: null, cobieComplete: null,
    hasStandardsPack: inputs.hasStandardsPack === true,
    openIssues: count(inputs.openIssues), openRfis: count(inputs.openRfis), hardClashes: count(inputs.hardClashes),
  };
  const defs = GATE_DEFS[stage] ?? [];                              // evaluateGate maps defs in order: checks[i] is defs[i]
  const g = evaluateGate(stage, m);
  const checks = g.checks.map((c, i) => {
    const metric = defs[i].metric;
    const source = !SOURCE[metric] ? NO_SERVER_SOURCE : c.na ? `not measured — ${SOURCE[metric]} not read` : SOURCE[metric];
    return { ...c, source };
  });
  const i = STAGES.indexOf(stage);
  return { stage, status: g.status, checks, next_stage: i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null };
}

/** The inputs the bridge can measure for `key`, each from a store scoped by the project key: the ruleset artefact
 *  (project → office), the BCF topics (bcf_topics.project_id is the key; open = status not Closed/Resolved, the
 *  Dashboard's own rule), the RFIs (bridge_docs store=rfi; open = status not Closed) and the recorded clashes
 *  (bridge_docs store=clash; unresolved = status not resolved). A store that cannot be read throws: the run fails, it
 *  never counts zero. */
export async function readGateInputs(key, deps = {}) {
  const cde = deps.docList && deps.bcfListTopics ? null : await import("./cde-store.mjs");
  const resolveArtefact = deps.resolveArtefact || (await import("./artefact-store.mjs")).resolveArtefact;
  const docList = deps.docList || cde.docList, bcfListTopics = deps.bcfListTopics || cde.bcfListTopics;
  const is = (s, re) => re.test(String(s ?? "").trim());
  const [ruleset, topics, rfis, clashes] = await Promise.all([
    resolveArtefact(key, "ruleset"), bcfListTopics(key, { status: "all" }), docList("rfi", key), docList("clash", key),
  ]);
  return {
    hasStandardsPack: ruleset.source !== "none",
    openIssues: topics.filter((t) => !is(t.topic_status, /^(closed|resolved)$/i)).length,
    openRfis: rfis.filter((r) => !is(r.status, /^closed$/i)).length,
    hardClashes: clashes.filter((c) => !is(c.status, /^resolved$/i)).length,
  };
}
