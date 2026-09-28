// The Federation Gate on the bridge: resolve the project's federated set (live model versions), load
// each manifest and verdict, judge with the pure core, keep the latest run, write the audit row. BCF
// topics are the route's job (they need the SSE broadcast). Deps-injected like changesets-store.
import { refLabel } from "./artefact-store.mjs";
import { resolveActor } from "./bridge-auth.mjs";

export const STORE = "federation";

async function wire(deps = {}) {
  const need = ["ensureProject", "docGet", "docUpsert", "audit", "versionVerdicts"];
  const cde = need.every((n) => deps[n]) ? null : await import("./cde-store.mjs");
  const ms = deps.listManifests && deps.getManifest ? null : await import("./manifest-store.mjs");
  const art = deps.resolveArtefact ? null : await import("./artefact-store.mjs");
  const core = deps.checkFederation ? null : await import("./sentinel-core.mjs");
  return {
    ensureProject: deps.ensureProject || cde.ensureProject,
    docGet: deps.docGet || cde.docGet,
    docUpsert: deps.docUpsert || cde.docUpsert,
    audit: deps.audit || cde.audit,
    versionVerdicts: deps.versionVerdicts || cde.versionVerdicts,
    listManifests: deps.listManifests || ms.listManifests,
    getManifest: deps.getManifest || ms.getManifest,
    resolveArtefact: deps.resolveArtefact || art.resolveArtefact,
    checkFederation: deps.checkFederation || core.checkFederation,
    requireMinRole: deps.requireMinRole || (await import("./members-store.mjs")).requireMinRole,
  };
}

/** What judged, as the one display string every judge uses; null when nothing is installed. */
const labelOf = (r) => (r && r.source !== "none" && r.body ? refLabel(r) : null);
const notInstalled = (kind, effect) => `no ${kind} installed for this project or its office (PUT /cde/:key/artefacts/${kind}) — ${effect}`;

export async function runFederation(key, { versions } = {}, { actor: claimed } = {}, deps) {
  const d = await wire(deps);
  // Who ran the gate is shown from the stored run: the signed-in caller's verified identity, never ?actor or body.actor
  // (cde-rem-9). The machine credential keeps its label; none is "web".
  const actor = resolveActor(claimed, "web");
  // H0 (D4, cde-rem-6): a run writes the project's latest federation document, a federation_gate ledger row and (on a
  // FAIL) BCF topics — a contributor's work; a viewer runs nothing. The machine credential passes as service.
  await d.requireMinRole(key, "contributor");
  const proj = await d.ensureProject(key);
  let set = await d.listManifests(key);
  let ignored = [];
  if (Array.isArray(versions) && versions.length) {
    const live = new Set(set.map((m) => m.version_id));
    ignored = versions.filter((v) => !live.has(v));
    set = set.filter((m) => versions.includes(m.version_id));
  }
  const models = [];
  for (const m of set) models.push({ container: m.container, version_id: m.version_id, manifest: m.has_manifest ? await d.getManifest(key, m.version_id) : null });
  const verdicts = await d.versionVerdicts(key, models.map((m) => m.version_id));
  // Both standards come through the artefact resolver (project → office → none), never a metadata slot:
  // the type rule (target "type", the TN family) from `ruleset`, the container-name shape from `naming`.
  const [rs, nm] = await Promise.all([d.resolveArtefact(key, "ruleset"), d.resolveArtefact(key, "naming")]);
  const naming = nm?.body ?? null;
  const rule = (Array.isArray(rs?.body?.rules) ? rs.body.rules : []).find((r) => r && r.target === "type" && Array.isArray(r.tokens) && r.tokens.length) || null;
  const org = rs?.body?.org ?? null;
  const result = d.checkFederation(models, { type_rule: rule, org, naming_ruleset: naming, verdicts });
  const refs = { ruleset: labelOf(rs), naming: labelOf(nm) };
  const fg02 = result.checks.find((c) => c.id === "FG-02");
  if (fg02) {
    fg02.refs = refs;
    if (!refs.ruleset) fg02.warnings.push(notInstalled("ruleset", "no type rule applied, naming shapes compared only"));
    if (!refs.naming) fg02.warnings.push(notInstalled("naming", "container names not judged (FG-06)"));
  }
  const run = {
    result, set: set.map((m) => ({ container: m.container, version_id: m.version_id, revision: m.revision ?? null, has_manifest: m.has_manifest })),
    at: new Date().toISOString(), actor, type_rule: rule?.id ?? null, naming_ruleset: naming?.title ?? null,
    ruleset_ref: refs.ruleset, naming_ref: refs.naming,
    // "all" = the whole live set was judged (a model added later makes it stale); "explicit" = a partial
    // run over a named subset (models outside the subset never affect its staleness).
    scope: Array.isArray(versions) && versions.length ? "explicit" : "all",
    ...(ignored.length ? { ignored_versions: ignored } : {}),
  };
  await d.docUpsert(STORE, proj.id, "latest", run, { service: true }); // after the check above; the store can be closed to direct writes (0033)
  const word = result.verdict === "pass" ? "PASS" : result.verdict === "fail" ? "FAIL" : "NOT CHECKABLE";
  const ignoredNote = ignored.length ? ` (${ignored.length} requested version(s) not live, ignored)` : "";
  await d.audit(proj.id, "federation_gate", null, `Federation gate ${word}: ${models.length} model(s)${ignoredNote}`, actor, null, {
    verdict: result.verdict, models: run.set, ruleset_ref: refs.ruleset, naming_ref: refs.naming,
    checks: result.checks.map((c) => ({ id: c.id, status: c.status, reason: c.reason ?? null, evidence: c.evidence.length })),
  });
  return run;
}

/** A run's set is stale per container: it changed if a container it recorded is no longer live, its
 *  live version_id moved on, or its manifest coverage changed (a backfill after a NOT CHECKABLE run). */
function isStale(recordedSet, liveSet, scope = "all") {
  const live = new Map(liveSet.map((m) => [m.container, m]));
  const recorded = new Set(recordedSet.map((m) => m.container));
  // Stale when a recorded model changed version or manifest state, OR — for a full run only — when a
  // live model exists that the run never saw (a container added after the run — final review 2026-09-23).
  return recordedSet.some((m) => {
    const l = live.get(m.container);
    return !l || l.version_id !== m.version_id || !!l.has_manifest !== !!m.has_manifest;
  }) || (scope !== "explicit" && liveSet.some((l) => !recorded.has(l.container)));
}

/** PURE — the lock on the clash register (spec 2026-09-28-3d-viewer-design.md Decision 4; the founder's "yes",
 *  2026-09-28): new clashes are recorded only when the Federation Gate passed on the current live set. A run stays free;
 *  what is locked is recording. `why` names the one thing to do, in words, when it is refused. */
export function raiseGate(fed) {
  const latest = fed?.latest ?? null;
  if (!latest) return { ok: false, why: "the Federation Gate has not been run on this project — run it first (Coordination ▸ Clash ▸ Run gate)" };
  // A run over a named subset (scope "explicit") is never stale for the live models it left out, so coverage is asked
  // separately: every live model must be in the run (found by the lock's review, 2026-09-28).
  const seen = new Set((latest.set ?? []).map((m) => m.container));
  const unjudged = (fed.live_set ?? []).filter((l) => !seen.has(l.container)).map((l) => l.container);
  if (unjudged.length) return { ok: false, why: `the Federation Gate's last run did not judge ${unjudged.length} live model(s) (${unjudged.slice(0, 3).join(", ")}${unjudged.length > 3 ? ", …" : ""}) — run it on the whole live set` };
  if (fed.stale) return { ok: false, why: "the Federation Gate's last run is stale — a live model changed since; run it again" };
  const verdict = latest.result?.verdict;
  if (verdict === "pass") return { ok: true, why: null };
  if (verdict === "fail") {
    const ids = (latest.result.checks ?? []).filter((c) => c.status === "fail").map((c) => c.id);
    return { ok: false, why: `the Federation Gate failed (${ids.length ? ids.join(", ") : "see its checks"}) — fix those and run it again` };
  }
  return { ok: false, why: "the Federation Gate could not check the models (NOT CHECKABLE) — capture their manifests and run it again" };
}

export async function getFederation(key, deps) {
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const latest = (await d.docGet(STORE, proj.id, "latest")) ?? null;
  const live = await d.listManifests(key);
  const stale = !!latest && isStale(latest.set, live, latest.scope ?? "all");
  return { latest, stale, live_set: live, raise: raiseGate({ latest, stale, live_set: live }) };
}
