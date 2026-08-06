// The enforcement-wiring check registry: named, bridge-evaluable checks a BEP/EIR section can bind to.
//
// Two rules govern everything here:
//   1. READ-ONLY. A compliance run never writes project data and never emits an audit row.
//   2. HONESTY. A check that cannot be evaluated returns not_checkable WITH a reason. Never return
//      "met" for something unmeasured — a fabricated pass is the one unacceptable failure of this
//      feature. PLANNED_CHECKS exists so a section can honestly say "not checkable yet, and here is why".
//
// Each check splits into a pure `classify(...)` (unit-tested, no I/O) and a thin `run(...)` that
// fetches state and delegates. Add a check by adding an entry — nothing else changes.
import { listFiles, getProjectMeta, listAudit, projectNamingRuleset } from "./cde-store.mjs";

let _core;
const core = async () => (_core ??= await import("./sentinel-core.mjs"));

const result = (id, label, status, { count = 0, summary = "", reason, evidence = [] } = {}) => ({
  id, label, status, count, summary, ...(reason ? { reason } : {}), evidence,
});

// ── pure classifiers ─────────────────────────────────────────────────────────────────────────────

const liveOf = (f) => (f.versions || []).find((v) => v.is_live) || null;

/** Default pure name validator (field-by-field pattern/enum match against separator-delimited parts). */
function defaultValidateContainerName(name, ruleset) {
  const parts = String(name || "").split(ruleset.separator);
  const failures = [];
  (ruleset.fields || []).forEach((f, i) => {
    const val = parts[i];
    if (f.enum) {
      if (!val || !f.enum.includes(val)) failures.push({ field: f.key, value: val, reason: `not one of ${f.enum.join(", ")}` });
    } else if (f.pattern) {
      const re = new RegExp(`^${f.pattern}$`);
      if (!val || !re.test(val)) failures.push({ field: f.key, value: val, reason: `does not match pattern ${f.pattern}` });
    }
  });
  return { ok: failures.length === 0, failures };
}

export function classifyNaming(files, ruleset, source, validate = defaultValidateContainerName) {
  const id = "naming.containers", label = "Container naming";
  if (!ruleset) return result(id, label, "not_checkable", { reason: "No naming ruleset is configured for this bridge or project, so container names cannot be checked." });
  if (!files.length) return result(id, label, "not_checkable", { reason: "This project has no containers yet — nothing to check." });
  const which = source === "project" ? "the project's ruleset" : "the bridge default ruleset";
  const bad = [];
  for (const f of files) {
    const r = validate(f.iso_name, ruleset);
    if (!r.ok) bad.push({ label: f.iso_name, detail: r.failures.map((x) => `${x.field}: ${x.reason}`).join("; "), ref: f.id });
  }
  return bad.length
    ? result(id, label, "violations", { count: bad.length, evidence: bad, summary: `${bad.length} of ${files.length} container name(s) fail ${which} (“${ruleset.title}”).` })
    : result(id, label, "met", { summary: `All ${files.length} container name(s) satisfy ${which} (“${ruleset.title}”).` });
}

export function classifyStates(files, expect) {
  const id = "cde.states", label = "Container states";
  if (!files.length) return result(id, label, "not_checkable", { reason: "This project has no containers yet — nothing to check." });
  const allowed = new Set(expect && expect.length ? expect : ["published"]);
  const bad = [];
  for (const f of files) {
    const live = liveOf(f);
    const state = live?.state ?? "(no live version)";
    if (!allowed.has(state)) bad.push({ label: f.iso_name, detail: `state is ${state}, expected ${[...allowed].join(" or ")}`, ref: f.id });
  }
  return bad.length
    ? result(id, label, "violations", { count: bad.length, evidence: bad, summary: `${bad.length} of ${files.length} container(s) are not ${[...allowed].join("/")}.` })
    : result(id, label, "met", { summary: `All ${files.length} container(s) are ${[...allowed].join("/")}.` });
}

export function classifySuitability(files, allowed) {
  const id = "cde.suitability", label = "Suitability codes";
  if (!files.length) return result(id, label, "not_checkable", { reason: "This project has no containers yet — nothing to check." });
  const ok = new Set(allowed && allowed.length ? allowed : ["S3", "S4"]);
  const bad = [];
  let liveCount = 0;
  for (const f of files) {
    const live = liveOf(f);
    if (!live) continue; // absence of a live version is cde.versioned's job, not this check's
    liveCount += 1;
    const s = live.suitability;
    if (!s || !ok.has(s)) bad.push({ label: f.iso_name, detail: `suitability is ${s || "(unset)"}, expected one of ${[...ok].join(", ")}`, ref: f.id });
  }
  if (!liveCount) return result(id, label, "not_checkable", { reason: "No container has a live version yet, so there are no suitability codes to check — see the cde.versioned check for that gap." });
  return bad.length
    ? result(id, label, "violations", { count: bad.length, evidence: bad, summary: `${bad.length} live version(s) carry a suitability outside ${[...ok].join(", ")}.` })
    : result(id, label, "met", { summary: `Every live version carries an allowed suitability code.` });
}

export function classifyVersioned(files) {
  const id = "cde.versioned", label = "Every container has a live version";
  if (!files.length) return result(id, label, "not_checkable", { reason: "This project has no containers yet — nothing to check." });
  const bad = files.filter((f) => !liveOf(f)).map((f) => ({ label: f.iso_name, detail: "no live version", ref: f.id }));
  return bad.length
    ? result(id, label, "violations", { count: bad.length, evidence: bad, summary: `${bad.length} container(s) have no live version.` })
    : result(id, label, "met", { summary: `All ${files.length} container(s) have a live version.` });
}

export function classifyGate(stage, gate) {
  const id = "gate.stage", label = "Stage gate";
  if (!gate.checks.length) return result(id, label, "not_checkable", { reason: `Stage “${stage}” has no gate defined (it is terminal).` });
  if (gate.checks.every((c) => c.na)) return result(id, label, "not_checkable", { reason: `No data is available for the “${stage}” gate yet — run a model scan from the browser to populate it.` });
  const failing = gate.checks.filter((c) => !c.na && !c.ok).map((c) => ({ label: c.label, detail: c.detail || "not met" }));
  if (failing.length) return result(id, label, "violations", { count: failing.length, evidence: failing, summary: `${failing.length} “${stage}” gate check(s) not met.` });
  // Partial measurement is not a pass. Some metrics passed but others were never collected — reporting
  // this as "met" would claim compliance that was never actually measured. That's the exact failure
  // mode this feature exists to prevent, so an unmeasured metric caps the result at not_checkable.
  const unmeasured = gate.checks.filter((c) => c.na).map((c) => ({ label: c.label, detail: c.detail || "not measured" }));
  if (unmeasured.length) {
    return result(id, label, "not_checkable", {
      count: unmeasured.length,
      evidence: unmeasured,
      reason: `${unmeasured.length} of ${gate.checks.length} gate metrics were never measured (${unmeasured.map((c) => c.label).join(", ")}) — the gate cannot be confirmed. Run a model scan from the browser to populate them.`,
    });
  }
  return result(id, label, "met", { summary: `The “${stage}” stage gate passes.` });
}

export function classifyPack(packId) {
  const id = "project.standards_pack", label = "Standards pack selected";
  return packId
    ? result(id, label, "met", { summary: `Standards pack: ${packId}.` })
    : result(id, label, "violations", { count: 1, summary: "No standards pack is selected for this project.", evidence: [{ label: "standards_pack", detail: "not set" }] });
}

export function classifyVerdicts(auditRows) {
  const id = "ids.last_verdict", label = "Governed adjudication verdicts";
  const newest = new Map(); // entity_id -> row (audit rows arrive newest-first; keep the first seen)
  for (const r of auditRows) {
    if (r.entity_type !== "file_version" || !String(r.action || "").startsWith("verdict:")) continue;
    const prev = newest.get(r.entity_id);
    if (!prev || String(r.at) > String(prev.at)) newest.set(r.entity_id, r);
  }
  if (!newest.size) return result(id, label, "not_checkable", { reason: "No governed verdict has been recorded on this project yet — publish through Governed Publish to produce one." });
  const bad = [];
  let acceptedCount = 0, recordedCount = 0;
  for (const [vid, r] of newest) {
    if (r.action === "verdict:rejected") bad.push({ label: `version ${String(vid).slice(0, 8)}`, detail: `rejected — ${r.new_value?.summary?.failing ?? "?"} failing requirement(s)`, ref: vid });
    else if (r.action === "verdict:recorded") recordedCount += 1;
    else acceptedCount += 1;
  }
  if (bad.length) {
    return result(id, label, "violations", { count: bad.length, evidence: bad, summary: `${bad.length} of ${newest.size} adjudicated version(s) were rejected.` });
  }
  // "recorded" means no IDS spec was configured, so nothing was actually adjudicated — reporting
  // "met" here would be the exact fabricated pass this feature exists to prevent.
  if (recordedCount) {
    return result(id, label, "not_checkable", {
      reason: acceptedCount
        ? `${recordedCount} of ${newest.size} version(s) were merely recorded without an IDS spec, not adjudicated — the result cannot be confirmed as met.`
        : `All ${recordedCount} version(s) were recorded without an IDS spec configured, so nothing was actually checked.`,
    });
  }
  return result(id, label, "met", { summary: `All ${newest.size} adjudicated version(s) were accepted.` });
}

export function classifyDeliverables(status) {
  const id = "midp.milestones", label = "Delivery milestones (MIDP/TIDP)";
  const s = status?.summary || {};
  if (!s.total) return result(id, label, "not_checkable", { reason: "No deliverables are defined for this project yet — add them in the Deliverables tab to check delivery against plan." });

  const problems = (status.rows || []).filter((r) => r.status === "late" || r.status === "overdue" || r.status === "in_wip");
  if (problems.length) {
    const detailOf = (r) =>
      r.status === "late" ? `published ${r.days_late} day(s) after ${r.due_date}`
      : r.status === "overdue" ? `nothing delivered — ${r.days_late} day(s) past ${r.due_date}`
      : `arrived but still WIP — never published${r.due_date ? ` (due ${r.due_date})` : ""}`;
    return result(id, label, "violations", {
      count: problems.length,
      evidence: problems.map((r) => ({ label: r.container_name, detail: detailOf(r) })),
      summary: `${problems.length} of ${s.total} deliverable(s) are late, overdue or unissued.`,
    });
  }

  // Nothing is failing — but a deliverable that is not yet due has not been MEASURED, so reporting
  // "met" would claim compliance for something that has not happened yet. Same posture as the
  // partial-na stage gate: unmeasured is not a pass.
  const outstanding = (s.pending || 0) + (s.unscheduled || 0);
  if (outstanding) {
    return result(id, label, "not_checkable", {
      count: outstanding,
      reason: `${s.delivered + s.late} of ${s.total} deliverable(s) are in; the remaining ${outstanding} are not yet due, so delivery cannot be confirmed yet.`,
    });
  }
  return result(id, label, "met", { summary: `All ${s.total} deliverable(s) were delivered.` });
}

// ── registry ─────────────────────────────────────────────────────────────────────────────────────

export const CHECKS = [
  {
    id: "naming.containers",
    label: "Container naming",
    description: "Every information container's name satisfies the project's ISO 19650 naming ruleset.",
    params_schema: {},
    async run(key) {
      const [files, { ruleset, source }, c] = await Promise.all([listFiles(key), projectNamingRuleset(key), core()]);
      return classifyNaming(files, ruleset, source, c.validateContainerName);
    },
  },
  {
    id: "cde.states",
    label: "Container states",
    description: "Every container's live version sits in one of the expected ISO 19650 states.",
    params_schema: { expect: { type: "string[]", default: ["published"], of: ["wip", "shared", "published", "archived"] } },
    async run(key, params = {}) { return classifyStates(await listFiles(key), params.expect); },
  },
  {
    id: "cde.suitability",
    label: "Suitability codes",
    description: "Every live version carries an allowed suitability code.",
    params_schema: { allowed: { type: "string[]", default: ["S3", "S4"] } },
    async run(key, params = {}) { return classifySuitability(await listFiles(key), params.allowed); },
  },
  {
    id: "cde.versioned",
    label: "Every container has a live version",
    description: "No container is left without a current version.",
    params_schema: {},
    async run(key) { return classifyVersioned(await listFiles(key)); },
  },
  {
    id: "gate.stage",
    label: "Stage gate",
    description: "The project passes the gate for its current stage.",
    params_schema: {},
    async run(key) {
      const [meta, c] = await Promise.all([getProjectMeta(key), core()]);
      const s = meta.snapshot || {};
      const metrics = {
        health: s.health ?? null, compliance: s.compliance ?? null,
        blockViolations: s.block_violations ?? 0, hardClashes: s.hard_clashes ?? 0,
        openIssues: s.open_issues ?? 0, openRfis: s.open_rfis ?? 0,
        hasStandardsPack: !!meta.standards_pack, cobieComplete: s.handover_readiness ?? null,
      };
      return classifyGate(meta.stage, c.evaluateGate(meta.stage, metrics));
    },
  },
  {
    id: "project.standards_pack",
    label: "Standards pack selected",
    description: "The project has an installed standards pack driving its rules.",
    params_schema: {},
    async run(key) { return classifyPack((await getProjectMeta(key)).standards_pack); },
  },
  {
    id: "ids.last_verdict",
    label: "Governed adjudication verdicts",
    description: "The most recent governed verdict recorded against each version was an acceptance.",
    params_schema: {},
    async run(key) { return classifyVerdicts(await listAudit(key)); },
  },
  {
    id: "midp.milestones",
    label: "Delivery milestones (MIDP/TIDP)",
    description: "Every planned deliverable arrived and was published by its due date.",
    params_schema: {},
    async run(key) {
      const dl = await import("./deliverables-store.mjs");
      return classifyDeliverables(await dl.deliverableStatus(key));
    },
  },
];

/**
 * Topics a BEP/EIR section obviously wants to bind to, for which Sentinel has NO enforcement surface
 * yet. Binding one is legitimate: the section then reports "not checkable" WITH this reason, which is
 * an honest statement of coverage rather than a silent blank. Each names the phase that will deliver it.
 */
export const PLANNED_CHECKS = [
  { id: "loin.levels", label: "Level of information need", reason: "Level-of-information-need is not modelled per stage or discipline yet; the IDS spec is bridge-wide, not per-project." },
  { id: "roles.responsibility", label: "Roles and responsibilities", reason: "No task-team or responsibility matrix exists — container authorship is free text." },
  { id: "qa.scorecard", label: "Model health scorecard", reason: "The QA engine runs bridge-side but model element facts are only available in the browser; no scan report is persisted." },
  { id: "federation.breakdown", label: "Federation strategy", reason: "There is no declared expected-model list to check the federation against." },
];

const BY_ID = new Map(CHECKS.map((c) => [c.id, c]));
export const getCheck = (id) => BY_ID.get(id);
export const listChecks = () => ({
  checks: CHECKS.map(({ id, label, description, params_schema }) => ({ id, label, description, params_schema })),
  planned: PLANNED_CHECKS,
});

/** Run one check. NEVER throws: an unknown id or a failing check becomes a reported status. */
export async function runCheck(id, projectKey, params = {}) {
  const planned = PLANNED_CHECKS.find((p) => p.id === id);
  if (planned) return result(id, planned.label, "not_checkable", { reason: planned.reason });
  const def = BY_ID.get(id);
  if (!def) return result(id, id, "not_checkable", { reason: `Unknown check “${id}” — it may have been removed or renamed.` });
  try {
    return await def.run(projectKey, params);
  } catch (e) {
    return result(id, def.label, "error", { summary: `Check failed: ${String(e?.message || e)}` });
  }
}
