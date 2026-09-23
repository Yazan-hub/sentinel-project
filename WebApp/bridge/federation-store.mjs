// The Federation Gate on the bridge: resolve the project's federated set (live model versions), load
// each manifest and verdict, judge with the pure core, keep the latest run, write the audit row. BCF
// topics are the route's job (they need the SSE broadcast). Deps-injected like changesets-store.
export const STORE = "federation";

async function wire(deps = {}) {
  const need = ["ensureProject", "docGet", "docUpsert", "audit", "versionVerdicts", "projectNamingRuleset"];
  const cde = need.every((n) => deps[n]) ? null : await import("./cde-store.mjs");
  const ms = deps.listManifests && deps.getManifest ? null : await import("./manifest-store.mjs");
  const art = deps.getArtefact ? null : await import("./artefact-store.mjs");
  const core = deps.checkFederation ? null : await import("./sentinel-core.mjs");
  return {
    ensureProject: deps.ensureProject || cde.ensureProject,
    docGet: deps.docGet || cde.docGet,
    docUpsert: deps.docUpsert || cde.docUpsert,
    audit: deps.audit || cde.audit,
    versionVerdicts: deps.versionVerdicts || cde.versionVerdicts,
    projectNamingRuleset: deps.projectNamingRuleset || cde.projectNamingRuleset,
    listManifests: deps.listManifests || ms.listManifests,
    getManifest: deps.getManifest || ms.getManifest,
    getArtefact: deps.getArtefact || art.getArtefact,
    checkFederation: deps.checkFederation || core.checkFederation,
  };
}

/** The project's type-naming rule: the ruleset artefact when installed, else the pack in
 *  projects.metadata.active_ruleset, else none (FG-02 then compares naming shapes only). */
async function typeRuleFor(key, d) {
  let rules = null, org = null;
  const a = await d.getArtefact(key, "ruleset").catch(() => null);
  if (a?.body && Array.isArray(a.body.rules)) { rules = a.body.rules; org = a.body.org ?? null; }
  else {
    const proj = await d.ensureProject(key);
    const rs = proj?.metadata?.active_ruleset;
    if (rs && Array.isArray(rs.rules)) { rules = rs.rules; org = rs.org ?? null; }
  }
  const rule = (rules || []).find((r) => r && r.target === "type" && Array.isArray(r.tokens) && r.tokens.length) || null;
  return { rule, org };
}

export async function runFederation(key, { versions } = {}, { actor = "web" } = {}, deps) {
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  let set = await d.listManifests(key);
  if (Array.isArray(versions) && versions.length) set = set.filter((m) => versions.includes(m.version_id));
  const models = [];
  for (const m of set) models.push({ container: m.container, version_id: m.version_id, manifest: m.has_manifest ? await d.getManifest(key, m.version_id) : null });
  const verdicts = await d.versionVerdicts(key, models.map((m) => m.version_id));
  const naming = (await d.projectNamingRuleset(key))?.ruleset ?? null;
  const { rule, org } = await typeRuleFor(key, d);
  const result = d.checkFederation(models, { type_rule: rule, org, naming_ruleset: naming, verdicts });
  const run = {
    result, set: set.map((m) => ({ container: m.container, version_id: m.version_id, revision: m.revision ?? null, has_manifest: m.has_manifest })),
    at: new Date().toISOString(), actor, type_rule: rule?.id ?? null, naming_ruleset: naming?.title ?? null,
  };
  await d.docUpsert(STORE, proj.id, "latest", run);
  const word = result.verdict === "pass" ? "PASS" : result.verdict === "fail" ? "FAIL" : "NOT CHECKABLE";
  await d.audit(proj.id, "federation_gate", null, `Federation gate ${word}: ${models.length} model(s)`, actor, null, {
    verdict: result.verdict, models: run.set,
    checks: result.checks.map((c) => ({ id: c.id, status: c.status, reason: c.reason ?? null, evidence: c.evidence.length })),
  });
  return run;
}

export async function getFederation(key, deps) {
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const latest = (await d.docGet(STORE, proj.id, "latest")) ?? null;
  const live = await d.listManifests(key);
  const ids = (xs) => xs.map((x) => x.version_id).sort().join(",");
  return { latest, stale: !!latest && ids(latest.set) !== ids(live), live_set: live };
}
