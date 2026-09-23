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
import { listFiles, getProjectMeta, listAudit, projectNamingRuleset, listTransmittals, NO_NAMING_REASON } from "./cde-store.mjs";
import { refLabel, resolveArtefact } from "./artefact-store.mjs";
import { OFFICE_CHECKS } from "./office-checks.mjs";

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

/** `named` is projectNamingRuleset's answer: { ruleset, source, ref, sha256 }. */
export function classifyNaming(files, named, validate = defaultValidateContainerName) {
  const id = "naming.containers", label = "Container naming";
  const ruleset = named?.ruleset ?? null;
  if (!ruleset) return result(id, label, "not_checkable", { reason: NO_NAMING_REASON });
  if (!files.length) return result(id, label, "not_checkable", { reason: "This project has no containers yet — nothing to check." });
  const which = refLabel(named);
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

/** Is a standard of `kind` in force for the project? Judged by the artefact resolver (project → office),
 *  never by a metadata display name. Met names ref · source · sha; nothing installed is a violation that
 *  names the install route (the question is "is one installed", so its absence is measured, not unknown). */
export function classifyStandard(resolved, kind, id, label, displayName = "") {
  if (!resolved || resolved.source === "none" || !resolved.body)
    return result(id, label, "violations", { count: 1, summary: `No ${kind} standard is installed for this project or its office.`, evidence: [{ label: kind, detail: `not installed — PUT /cde/:key/artefacts/${kind}` }] });
  const ref = refLabel(resolved);
  return result(id, label, "met", { summary: `${displayName ? `${displayName}: ` : ""}${ref}.`, evidence: [{ label: kind, detail: ref }] });
}

/** project.standards_pack: the scan ruleset artefact; metadata.standards_pack is shown as its name only. */
export const classifyPack = (resolved, displayName) => classifyStandard(resolved, "ruleset", "project.standards_pack", "Standards pack selected", displayName);

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

/** Shared shape for the two expectation checks — axis is "revision" | "suitability". */
function classifyMidpExpectation(status, axis, id, label, noun) {
  const rows = (status?.rows || []).filter((r) => (axis === "revision" ? r.expected_revision : r.expected_suitability));
  if (!rows.length)
    return result(id, label, "not_checkable", { reason: `No expected ${noun} is set on any deliverable — add expectations in the Deliverables tab to check delivery evidence.` });
  const verdictOf = (r) => r.evidence?.[axis];
  const mismatches = rows.filter((r) => verdictOf(r) === "mismatch");
  if (mismatches.length) {
    const actuals = axis === "revision" ? (r) => r.evidence.actual_revisions : (r) => r.evidence.actual_suitabilities;
    const expected = axis === "revision" ? (r) => r.expected_revision : (r) => r.expected_suitability;
    return result(id, label, "violations", {
      count: mismatches.length,
      evidence: mismatches.map((r) => ({ label: r.container_name, detail: `expected ${expected(r)}${r.due_date ? ` by ${r.due_date}` : ""} — published ${actuals(r).join(", ") || "nothing usable"}` })),
      summary: `${mismatches.length} of ${rows.length} expectation(s) not met by what published.`,
    });
  }
  // "met" must be POSITIVE, never by elimination — in the verdict AND in every sentence a human
  // reads: `rows.length - pending` would count an unjudged row as met, fabricating the number a
  // delivery manager acts on even when the verdict itself stays not_checkable.
  const met = rows.filter((r) => verdictOf(r) === "met").length;
  const pendingRows = rows.filter((r) => verdictOf(r) === "pending");
  if (pendingRows.length)
    return result(id, label, "not_checkable", {
      count: pendingRows.length,
      reason: `${met} of ${rows.length} expectation(s) met; not yet published: ${pendingRows.map((r) => r.container_name).join(", ")} — their ${noun} cannot be judged yet.`,
    });
  if (met !== rows.length)
    return result(id, label, "not_checkable", {
      reason: `${rows.length - met} expectation-bearing row(s) carry no evidence verdict — cannot confirm ${noun} delivery.`,
    });
  return result(id, label, "met", { summary: `All ${rows.length} expected ${noun}(s) were delivered as planned.` });
}


/**
 * Karim's test, as a check: does every planned deliverable say WHO produces it, WHEN, and WHICH
 * DECISION it supports? A plan missing any of the three is a document register, not a plan.
 * Reports the gap per row — never averages it away, never passes by elimination.
 */
export function classifyPlanCompleteness(status) {
  const id = "midp.plan_completeness", label = "Every deliverable has an owner, a date and a purpose";
  const rows = status?.rows || [];
  if (!rows.length) return result(id, label, "not_checkable", { reason: "No deliverables are defined for this project yet — there is no plan to assess." });
  const bad = [];
  for (const r of rows) {
    const missing = [];
    if (!String(r.responsible_team ?? "").trim()) missing.push("owner (responsible team)");
    if (!String(r.due_date ?? "").trim()) missing.push("date");
    if (!String(r.purpose ?? "").trim()) missing.push("purpose (which decision it supports)");
    if (missing.length) bad.push({ label: r.container_name, detail: `missing ${missing.join(", ")}` });
  }
  return bad.length
    ? result(id, label, "violations", { count: bad.length, evidence: bad, summary: `${bad.length} of ${rows.length} deliverable(s) are not a plan yet — owner, date or purpose is missing.` })
    : result(id, label, "met", { summary: `All ${rows.length} deliverable(s) name an owner, a date and the decision they support.` });
}

/**
 * Issue distribution: was every PUBLISHED version actually issued to someone, on the record?
 *
 * ISO 19650 "issue" is a transmittal with recipients — not a state change. A transmittal carrying no
 * recipients evidences nothing, so it never satisfies a version: naming that case explicitly is the
 * difference between an honest gap and a fabricated pass. Superseded published versions still count:
 * they were issued at the time, and an unissued one is a real hole in the record.
 */
export function classifyDistribution(files, transmittals) {
  const id = "midp.distribution", label = "Issue distribution (MIDP)";
  const published = [];
  for (const f of files || []) {
    for (const v of f.versions || []) {
      if (v.state === "published") published.push({ file: f, version: v });
    }
  }
  if (!published.length)
    return result(id, label, "not_checkable", { reason: "Nothing has reached published on this project yet, so there is no issue to evidence." });

  // A transmittal only evidences distribution when it names at least one recipient.
  const withRecipients = new Set();
  const withoutRecipients = new Map(); // version_id -> transmittal reference
  for (const t of transmittals || []) {
    const ids = Array.isArray(t.version_ids) ? t.version_ids : [];
    const hasRecipient = (Array.isArray(t.recipients) ? t.recipients : []).some((r) => String(r ?? "").trim());
    for (const vid of ids) {
      if (hasRecipient) withRecipients.add(vid);
      else if (!withoutRecipients.has(vid)) withoutRecipients.set(vid, t.reference || "(unreferenced)");
    }
  }

  const bad = [];
  for (const { file, version } of published) {
    if (withRecipients.has(version.id)) continue;
    const empty = withoutRecipients.get(version.id);
    bad.push({
      label: `${file.iso_name} ${version.revision}`,
      detail: empty
        ? `transmittal ${empty} lists no recipients, so it evidences no issue`
        : "published, but no transmittal records issuing it to anyone",
      ref: version.id,
    });
  }
  return bad.length
    ? result(id, label, "violations", { count: bad.length, evidence: bad, summary: `${bad.length} of ${published.length} published version(s) were never issued to a named recipient.` })
    : result(id, label, "met", { summary: `All ${published.length} published version(s) were issued to named recipients on a transmittal.` });
}

/**
 * Roles and responsibilities: does every planned deliverable resolve to a DECLARED task team, and
 * does every team it relies on name an accountable human?
 *
 * Two distinct failures, never merged: a deliverable pointing at a team nobody declared, and a
 * declared team with no named lead. Both are "there is no one accountable for this", and a
 * responsibility matrix that averages them away is the org chart the BEP already had.
 */
export function classifyResponsibility(status, teams) {
  const id = "roles.responsibility", label = "Roles and responsibilities";
  const rows = status?.rows || [];
  if (!rows.length)
    return result(id, label, "not_checkable", { reason: "No deliverables are defined for this project yet, so there is no production to assign to a task team." });

  const norm = (v) => String(v ?? "").trim().toLowerCase();
  const byCode = new Map((teams || []).map((t) => [norm(t.code), t]));
  const bad = [];
  const referenced = new Map(); // code -> team, for the lead check below

  for (const r of rows) {
    const team = norm(r.responsible_team);
    if (!team) {
      bad.push({ label: r.container_name, detail: "names no task team — nobody is accountable for producing it" });
      continue;
    }
    const declared = byCode.get(team);
    if (!declared) {
      bad.push({ label: r.container_name, detail: `names task team "${String(r.responsible_team).trim()}", which is not declared in the responsibility matrix` });
      continue;
    }
    referenced.set(team, declared);
  }

  for (const [, t] of referenced) {
    if (!String(t.lead_email ?? "").trim())
      bad.push({ label: `task team ${t.code}`, detail: "is declared but names no accountable lead", ref: t.id });
  }

  return bad.length
    ? result(id, label, "violations", { count: bad.length, evidence: bad, summary: `${bad.length} responsibility gap(s): ${rows.length} deliverable(s) against ${byCode.size} declared task team(s).` })
    : result(id, label, "met", { summary: `All ${rows.length} deliverable(s) resolve to a declared task team with a named accountable lead.` });
}

/**
 * Review before issue: was the version AUTHORIZED by someone other than the person who submitted it?
 *
 * Passing through `shared` proves nothing — 0002's state machine already forbids wip→published, so
 * every published version has been "shared" by construction. The only evidence of review the ledger
 * actually carries is segregation of duty: one identity submitted (wip→shared), a different identity
 * authorized (shared→published). Same person on both ends is self-issue, whatever the states say.
 *
 * Generic actors ("web", "service") are identities Sentinel could not resolve. Comparing two of them
 * would manufacture either a pass or a violation out of nothing, so such a version is UNMEASURED and
 * caps the result at not_checkable — never at met.
 */
const GENERIC_ACTORS = new Set(["", "web", "service", "bridge", "unknown", "null"]);

export function classifyReview(files, auditRows) {
  const id = "midp.review", label = "Review before issue (MIDP)";
  const published = [];
  for (const f of files || []) {
    for (const v of f.versions || []) {
      if (v.state === "published") published.push({ file: f, version: v });
    }
  }
  if (!published.length)
    return result(id, label, "not_checkable", { reason: "Nothing has reached published on this project yet, so there is no issue to have reviewed." });

  // Audit rows arrive newest-first; the first seen of each action is the one that governs.
  const submitted = new Map(), authorized = new Map();
  for (const r of auditRows || []) {
    if (r.entity_type !== "container_version") continue;
    const map = r.action === "state:wip->shared" ? submitted : r.action === "state:shared->published" ? authorized : null;
    if (map && !map.has(r.entity_id)) map.set(r.entity_id, r.actor);
  }
  const named = (a) => {
    const v = String(a ?? "").trim();
    return GENERIC_ACTORS.has(v.toLowerCase()) ? null : v;
  };

  const bad = [], unmeasured = [];
  let reviewed = 0;
  for (const { file, version } of published) {
    const who = `${file.iso_name} ${version.revision}`;
    const sub = named(submitted.get(version.id)), auth = named(authorized.get(version.id));
    if (!sub || !auth) {
      unmeasured.push({
        label: who,
        detail: !submitted.has(version.id) || !authorized.has(version.id)
          ? "its state transitions are outside the audit window read here, so review cannot be judged"
          : "submitted or authorized by an unresolved identity, so independence cannot be judged",
      });
      continue;
    }
    if (sub.toLowerCase() === auth.toLowerCase())
      bad.push({ label: who, detail: `submitted and authorized by the same person (${auth}) — no independent review before issue`, ref: version.id });
    else reviewed += 1;
  }

  if (bad.length)
    return result(id, label, "violations", { count: bad.length, evidence: bad, summary: `${bad.length} of ${published.length} published version(s) were issued without independent review.` });
  // Partial measurement is not a pass — same posture as the stage gate.
  if (unmeasured.length)
    return result(id, label, "not_checkable", {
      count: unmeasured.length,
      evidence: unmeasured,
      reason: `${reviewed} of ${published.length} published version(s) show independent review; the remaining ${unmeasured.length} cannot be judged, so review cannot be confirmed.`,
    });
  return result(id, label, "met", { summary: `All ${published.length} published version(s) were authorized by someone other than the person who submitted them.` });
}

export const classifyMidpRevision = (status) =>
  classifyMidpExpectation(status, "revision", "midp.revision", "Delivered revisions (MIDP)", "revision");
export const classifyMidpSuitability = (status) =>
  classifyMidpExpectation(status, "suitability", "midp.suitability", "Delivered suitability (MIDP)", "suitability");

// ── registry ─────────────────────────────────────────────────────────────────────────────────────

export const CHECKS = [
  {
    id: "naming.containers",
    label: "Container naming",
    description: "Every information container's name satisfies the naming standard installed on the project or its office.",
    params_schema: {},
    async run(key) {
      const [files, named, c] = await Promise.all([listFiles(key), projectNamingRuleset(key), core()]);
      return classifyNaming(files, named, c.validateContainerName);
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
    description: "A scan ruleset artefact is in force for the project or its office.",
    params_schema: {},
    async run(key) {
      const [resolved, meta] = await Promise.all([resolveArtefact(key, "ruleset"), getProjectMeta(key)]);
      return classifyPack(resolved, meta.standards_pack);
    },
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
  {
    id: "midp.plan_completeness",
    label: "Every deliverable has an owner, a date and a purpose",
    description: "Every planned deliverable names who produces it, when it is due, and which decision it supports.",
    params_schema: {},
    async run(key) {
      const dl = await import("./deliverables-store.mjs");
      return classifyPlanCompleteness(await dl.deliverableStatus(key));
    },
  },
  {
    id: "midp.revision",
    label: "Delivered revisions (MIDP)",
    description: "Every deliverable with an expected revision had that revision reach published by its due date.",
    params_schema: {},
    async run(key) {
      const dl = await import("./deliverables-store.mjs");
      return classifyMidpRevision(await dl.deliverableStatus(key));
    },
  },
  {
    id: "midp.suitability",
    label: "Delivered suitability (MIDP)",
    description: "Every deliverable with an expected suitability published at that suitability code by its due date.",
    params_schema: {},
    async run(key) {
      const dl = await import("./deliverables-store.mjs");
      return classifyMidpSuitability(await dl.deliverableStatus(key));
    },
  },
  {
    id: "roles.responsibility",
    label: "Roles and responsibilities",
    description: "Every planned deliverable resolves to a declared task team with a named accountable lead.",
    params_schema: {},
    async run(key) {
      const [dl, tt] = await Promise.all([import("./deliverables-store.mjs"), import("./task-teams-store.mjs")]);
      const [status, teams] = await Promise.all([dl.deliverableStatus(key), tt.listTeams(key)]);
      return classifyResponsibility(status, teams);
    },
  },
  {
    id: "midp.review",
    label: "Review before issue (MIDP)",
    description: "Every published version was authorized by someone other than the person who submitted it.",
    params_schema: {},
    async run(key) {
      const [files, rows] = await Promise.all([listFiles(key), listAudit(key)]);
      return classifyReview(files, rows);
    },
  },
  {
    id: "midp.distribution",
    label: "Issue distribution (MIDP)",
    description: "Every published version was issued to named recipients on a transmittal.",
    params_schema: {},
    async run(key) {
      const [files, transmittals] = await Promise.all([listFiles(key), listTransmittals(key)]);
      return classifyDistribution(files, transmittals);
    },
  },
  ...OFFICE_CHECKS,
];

/**
 * Topics a BEP/EIR section obviously wants to bind to, for which Sentinel has NO enforcement surface
 * yet. Binding one is legitimate: the section then reports "not checkable" WITH this reason, which is
 * an honest statement of coverage rather than a silent blank. Each names the phase that will deliver it.
 */
export const PLANNED_CHECKS = [
  { id: "loin.levels", label: "Level of information need", reason: "Level-of-information-need is not modelled per stage or discipline yet; the IDS spec is bridge-wide, not per-project." },
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
    return await runCheckScoped(def, projectKey, params);
  } catch (e) {
    return result(id, def.label, "error", { summary: `Check failed: ${String(e?.message || e)}` });
  }
}

/** Run one check definition for a key. For an OFFICE key and a rollup-eligible check, run it for the
 *  office and each of its projects and roll the results up (worst wins, evidence per project). Template
 *  items and plain projects run once, exactly as before. A scope that cannot be resolved (unknown key,
 *  bridge without the office migration) degrades to the single run. */
export async function runCheckScoped(def, projectKey, params = {}, deps = {}) {
  const scope = await import("./office-scope.mjs");
  if (scope.ROLLUP_CHECK_IDS.has(def.id)) {
    let sc = null;
    try { sc = await (deps.projectScope || scope.projectScope)(projectKey); } catch { sc = null; }
    if (sc && sc.kind === "office") {
      const per = [];
      for (const k of sc.keys) {
        try { per.push({ key: k, result: await def.run(k, params) }); }
        catch (e) { per.push({ key: k, result: result(def.id, def.label, "error", { summary: `Check failed: ${String(e?.message || e)}` }) }); }
      }
      const rolled = scope.rollupResults(def.id, def.label, per);
      if (sc.keys.length === 1 && rolled.status === "not_checkable") {
        rolled.reason = "no projects belong to this office";
      }
      return rolled;
    }
  }
  return def.run(projectKey, params);
}
