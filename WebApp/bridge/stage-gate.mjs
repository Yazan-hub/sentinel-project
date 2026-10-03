// The stage gate, measured on the bridge (cohesion phase 5c, spec 2026-09-26 Decision 10). The gate's inputs are read
// from what the bridge holds — the ruleset artefact, the BCF topic store, the RFI store and the clash store — and judged
// by the same evaluateGate the browser bundles (sentinel-core.mjs). Health, compliance, block violations and COBie
// completeness have no server source (the browser scan is not persisted), so a gate that needs one is not_checkable: it
// never passes on a number nobody measured, and every check names what was read. measureGate is pure; readGateInputs is
// the thin I/O half with its deps injected (the artefact-store idiom), so the tests never touch Supabase.
import { evaluateGate, GATE_DEFS, parseLodMatrix } from "./sentinel-core.mjs";
import { STAGES } from "./cde-store.mjs";

export const NO_SERVER_SOURCE = "not measured — no server source: the browser scan is not persisted";
const SOURCE = { hasStandardsPack: "ruleset artefact", openIssues: "BCF topics (bcf-store)", openRfis: "RFI store", hardClashes: "clash store", cobieComplete: "COBie on the live models",
  lodState: "the newest lod_state ledger row" }; // MA-2b
// The metrics whose reader names its own source (the models it read, the ledger row it read) in this input.
const SOURCED = { cobieComplete: "cobieSource", lodState: "lodSource" };
const count = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Judge `stage` on inputs = {hasStandardsPack, openIssues, openRfis, hardClashes}; a count is a finite number, or null
 *  = not read (a string or NaN is not read either — never a zero nobody counted). Health, compliance, block violations
 *  and COBie are null here by construction. Returns {stage, status: pass | hold | not_checkable, checks: [{label, ok, na,
 *  detail, source}], next_stage} — next_stage is null on the last stage. */
export function measureGate(stage, inputs = {}) {
  const m = {
    health: null, compliance: null, blockViolations: null,
    cobieComplete: count(inputs.cobieComplete), lodState: count(inputs.lodState),
    hasStandardsPack: inputs.hasStandardsPack === true,
    openIssues: count(inputs.openIssues), openRfis: count(inputs.openRfis), hardClashes: count(inputs.hardClashes),
  };
  const defs = GATE_DEFS[stage] ?? [];                              // evaluateGate maps defs in order: checks[i] is defs[i]
  const g = evaluateGate(stage, m);
  const checks = g.checks.map((c, i) => {
    const metric = defs[i].metric;
    const source = !SOURCE[metric] ? NO_SERVER_SOURCE
      : SOURCED[metric] ? (inputs[SOURCED[metric]] ?? (c.na ? `not measured — ${SOURCE[metric]} not read` : SOURCE[metric]))
      : c.na ? `not measured — ${SOURCE[metric]} not read` : SOURCE[metric];
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
  const [ruleset, topics, rfis, clashes, cobie, lod] = await Promise.all([
    resolveArtefact(key, "ruleset"), bcfListTopics(key, { status: "all" }), docList("rfi", key), docList("clash", key),
    (deps.readCobie || readCobie)(key), (deps.readLodState || readLodState)(key),
  ]);
  return {
    cobieComplete: cobie.readiness, cobieSource: cobie.source,
    lodState: lod.share, lodSource: lod.source, // MA-2b
    hasStandardsPack: ruleset.source !== "none",
    openIssues: topics.filter((t) => !is(t.topic_status, /^(closed|resolved)$/i)).length,
    openRfis: rfis.filter((r) => !is(r.status, /^closed$/i)).length,
    hardClashes: clashes.filter((c) => !is(c.status, /^resolved$/i)).length,
  };
}

/** MA-2b (design §3.2, D18): the design → coord gate's LOD state — the share at the DD row from the newest lod_state ledger row
 *  (Promote's count in Revit; the bridge marked it claimed): {share, source}. null (not measured) when there is no row yet, when
 *  the row's matrix maps DD to another project stage than design, when it was measured against another lod_matrix than the one
 *  in force (journey-store lodRowStale), or when it has no share (a class the matrix asks for was not run, or nothing was
 *  counted); the source says which. */
export async function readLodState(key, deps = {}) {
  const listAudit = deps.listAudit || (await import("./cde-store.mjs")).listAudit;
  const resolveArtefact = deps.resolveArtefact || (await import("./artefact-store.mjs")).resolveArtefact;
  const { lodRowStale } = await import("./journey-store.mjs");
  const [audit, mx] = await Promise.all([listAudit(key, { entity_type: "lod_state", limit: 1 }), resolveArtefact(key, "lod_matrix")]);
  const row = audit.rows?.[0];
  if (!row) return { share: null, source: "LOD state: not measured — no lod_state row yet (Promote (DD) in Revit records one)" };
  const v = row.new_value ?? {};
  const stale = lodRowStale(row, mx);
  if (stale) return { share: null, source: `LOD state: not measured — ${stale}` };
  // The row was measured against the matrix in force, so that matrix's stage map says where DD lands — never the row's own
  // project_stage, which the client wrote (review).
  let stage;
  try { stage = parseLodMatrix(mx.body).stage_map.DD; } catch (e) { return { share: null, source: `LOD state: not measured — the lod_matrix in force did not parse: ${e.message}` }; }
  if (stage !== "design")
    return { share: null, source: `LOD state: not measured — lod_state ledger #${row.id} measured DD, which its lod_matrix maps to ${stage}, not design` };
  if (typeof v.share !== "number") {
    const unrun = (v.not_run ?? []).filter((n) => !String(n).endsWith(": no DD row in the LOD matrix"));
    return { share: null, source: `LOD state: not measured — lod_state ledger #${row.id} has no share: ` +
      (unrun.length ? `${unrun.join("; ")} (a class the matrix asks for that Promote did not run)` : "it counted no element") };
  }
  return { share: v.share, source: `lod_state ledger #${row.id} — ${v.line} (Revit's count, claimed: ${row.actor}, ${row.at})` };
}

/** COBie hand-over completeness of the project's live IFC models, from their manifests (captured with the governed
 *  bytes): {readiness, source}. readiness is floor(complete/total·100) across the live models — null (not measured) when
 *  any live model's manifest has no COBie measure (captured before it was measured, or its read failed), when there is
 *  no live model, or when no maintainable asset was found; the source says which. Never a readiness nobody measured. */
export async function readCobie(key, deps = {}) {
  const ms = deps.liveModelVersions && deps.docGet && deps.ensureProject ? deps : { ...(await import("./manifest-store.mjs")), ...(await import("./cde-store.mjs")), ...deps };
  const proj = await ms.ensureProject(key);
  const live = await ms.liveModelVersions(key);
  if (!live.length) return { readiness: null, source: "not measured — no live IFC model" };
  let complete = 0, total = 0;
  const named = [];
  for (const m of live) {
    const doc = await ms.docGet("manifest", proj.id, m.version_id);
    const c = doc?.cobie;
    const label = `${m.container} ${m.revision ?? ""}`.trim();
    if (!doc) return { readiness: null, source: `not measured — ${label} has no manifest` };
    if (!c) return { readiness: null, source: `not measured — ${label}'s manifest was captured before COBie was measured (backfill it)` };
    if (c.not_read) return { readiness: null, source: `not measured — ${label}: COBie not read (${c.not_read})` };
    complete += c.complete; total += c.total;
    named.push(`${label} ${c.complete}/${c.total}${doc.sha256 ? ` · sha256 ${String(doc.sha256).slice(0, 12)}…` : ""}`);
  }
  if (!total) return { readiness: null, source: `not measured — no maintainable asset (doors, windows, MEP equipment) in ${named.join("; ")}` };
  return { readiness: Math.floor((complete / total) * 100), source: `COBie on the live models: ${named.join("; ")}` };
}
