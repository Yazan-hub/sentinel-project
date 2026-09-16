// office.* checks — what Sentinel can MEASURE about an office from what the add-in sent (snapshot, scan)
// and what the project already holds (documents, members, task teams). Same doctrine as check-registry:
// read-only, never a fabricated pass, not_checkable WITH a reason. Pure classifiers + thin run().
import { getSnapshot, getScan } from "./office-store.mjs";
import { getProjectMeta, sb, ensureProject } from "./cde-store.mjs";
import { listMembers } from "./members-store.mjs";
import { listTeams } from "./task-teams-store.mjs";
import { executability } from "./executability.mjs";

export const SNAPSHOT_MAX_AGE_DAYS = 30;
export const TEMPLATE_TYPES_MIN_PCT = 90;
export const MODEL_HEALTH_MAX_WARN = 25;
export const BEP_MIN_SCORE = 50;
const REQUIRED_NAMING_TARGETS = ["family", "type", "view", "sheet"];
const EVIDENCE_CAP = 10;

const result = (id, label, status, { count = 0, summary = "", reason, evidence = [] } = {}) => ({
  id, label, status, count, summary, ...(reason ? { reason } : {}), evidence,
});
const enc = encodeURIComponent;
const day = (iso) => String(iso || "").slice(0, 10);
const ageDays = (iso, now) => (now.getTime() - new Date(iso).getTime()) / 86_400_000;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let _core;
const core = async () => (_core ??= await import("./sentinel-core.mjs"));

/** `{org}` in token defs → the escaped office code (as the add-in's OrgNames.Apply does); verbatim elsewhere. */
export function expandOrg(rule, org) {
  const code = String(org || "");
  const defs = Object.fromEntries(Object.entries(rule.token_defs || {}).map(([k, v]) => [k, String(v).replaceAll("{org}", escapeRegex(code))]));
  const parameter_name = rule.parameter_name ? String(rule.parameter_name).replaceAll("{org}", code) : rule.parameter_name;
  return { ...rule, token_defs: defs, ...(parameter_name !== undefined && { parameter_name }) };
}

// ── pure classifiers ─────────────────────────────────────────────────────────────────────────────

export function classifySnapshotPresent(snap, now = new Date()) {
  const id = "office.snapshot_present", label = "Office snapshot received";
  if (!snap) return result(id, label, "not_checkable", { reason: "No office snapshot received — in Revit, open the office template and use Standards → Send office snapshot to Sentinel." });
  const age = ageDays(snap.at, now);
  if (!(age <= SNAPSHOT_MAX_AGE_DAYS)) return result(id, label, "not_checkable", { reason: `Snapshot is from ${day(snap.at)} (older than ${SNAPSHOT_MAX_AGE_DAYS} days) — send a fresh one.` });
  return result(id, label, "met", { summary: `Snapshot of ${snap.source?.title || snap.source?.kind || "the office"} taken ${day(snap.at)}: ${snap.catalog?.count ?? 0} types, ${snap.pack?.worksets?.length ?? 0} worksets, ${snap.pack?.shared_parameters?.length ?? 0} shared parameters.` });
}

export function classifyNamingRules(ruleset) {
  const id = "office.naming_rules", label = "Naming rules for families, types, views, sheets";
  if (!ruleset) return result(id, label, "not_checkable", { reason: "The snapshot carried no ruleset, so the office's naming rules cannot be checked." });
  const targets = new Set((ruleset.rules || []).map((r) => String(r.target || "").toLowerCase()));
  const evidence = REQUIRED_NAMING_TARGETS.filter((t) => !targets.has(t)).map((t) => ({ label: t, detail: `no ${t} naming rule` }));
  if (!String(ruleset.org || "").trim()) evidence.push({ label: "org", detail: "office code is empty — every {org} rule is skipped" });
  return evidence.length
    ? result(id, label, "violations", { count: evidence.length, evidence, summary: `Missing: ${evidence.map((e) => e.label).join(", ")}.` })
    : result(id, label, "met", { summary: `Rules for ${REQUIRED_NAMING_TARGETS.join(", ")} present; office code ${ruleset.org}.` });
}

export function classifyTemplateTypes(catalog, ruleset) {
  const id = "office.template_types", label = "Template types follow the type convention";
  const rules = (ruleset?.rules || []).filter((r) => String(r.target).toLowerCase() === "type" && (r.tokens || []).length);
  if (!rules.length) return result(id, label, "not_checkable", { reason: "No type-naming (TN) rule in the office ruleset — the convention is not declared, so nothing can be measured." });
  const engineRules = rules.map((r) => expandOrg(r, ruleset.org));
  const byCat = new Map();
  for (const r of engineRules) for (const c of r.categories || []) byCat.set(c, r);
  const governed = (catalog?.types || []).filter((t) => byCat.has(t.category));
  if (!governed.length) return result(id, label, "not_checkable", { reason: `The catalogue has no types in the governed categories (${[...byCat.keys()].join(", ")}).` });
  const compile = (r) => new RegExp("^" + (r.tokens || []).map((t) => (r.token_defs?.[t] !== undefined ? `(?:${r.token_defs[t]})` : "[A-Za-z0-9\\-]+")).join(escapeRegex(r.separator ?? "_")) + "$");
  const rx = new Map(engineRules.map((r) => [r.id, compile(r)]));
  const bad = governed.filter((t) => !rx.get(byCat.get(t.category).id).test(t.type));
  const pct = Math.round(((governed.length - bad.length) / governed.length) * 100);
  const summary = `${governed.length - bad.length} of ${governed.length} governed types (${pct} %) match the type convention; threshold ${TEMPLATE_TYPES_MIN_PCT} %.`;
  return pct >= TEMPLATE_TYPES_MIN_PCT
    ? result(id, label, "met", { summary })
    : result(id, label, "violations", { count: bad.length, summary, evidence: bad.slice(0, EVIDENCE_CAP).map((t) => ({ label: t.category, detail: t.type })) });
}

export function classifyWorksets(worksets, ruleset) {
  const id = "office.worksets", label = "Worksets follow the office whitelist";
  const rule = (ruleset?.rules || []).find((r) => String(r.target).toLowerCase() === "workset" && (r.whitelist || []).length);
  if (!rule) return result(id, label, "not_checkable", { reason: "No workset whitelist rule in the office ruleset." });
  const want = new Set(rule.whitelist), have = new Set((worksets || []).map((w) => w.name));
  const evidence = [...[...want].filter((n) => !have.has(n)).map((n) => ({ label: "missing", detail: n })), ...[...have].filter((n) => !want.has(n)).map((n) => ({ label: "extra", detail: n }))];
  return evidence.length
    ? result(id, label, "violations", { count: evidence.length, evidence, summary: `${evidence.filter((e) => e.label === "missing").length} whitelisted workset(s) missing, ${evidence.filter((e) => e.label === "extra").length} not on the whitelist.` })
    : result(id, label, "met", { summary: `All ${want.size} whitelisted worksets present, no extras.` });
}

export function classifySharedParams(sharedParams, ruleset) {
  const id = "office.shared_params", label = "Required shared parameters exist";
  const names = (ruleset?.rules || []).filter((r) => String(r.target).toLowerCase() === "parameter" && r.parameter_name).map((r) => expandOrg(r, ruleset.org).parameter_name);
  if (!names.length) return result(id, label, "not_checkable", { reason: "No parameter rule names a required shared parameter." });
  const have = new Set((sharedParams || []).map((p) => p.name));
  const missing = [...new Set(names)].filter((n) => !have.has(n));
  return missing.length
    ? result(id, label, "violations", { count: missing.length, evidence: missing.map((n) => ({ label: "missing", detail: n })), summary: `${missing.length} required shared parameter(s) missing from the template.` })
    : result(id, label, "met", { summary: `All ${new Set(names).size} required shared parameter(s) present.` });
}

export function classifyModelHealth(scan, now = new Date()) {
  const id = "office.model_health", label = "Live model health";
  if (!scan) return result(id, label, "not_checkable", { reason: "No scan report received — synchronise a model with the add-in installed." });
  if (!(ageDays(scan.at, now) <= SNAPSHOT_MAX_AGE_DAYS)) return result(id, label, "not_checkable", { reason: `Last scan is from ${day(scan.at)} (older than ${SNAPSHOT_MAX_AGE_DAYS} days).` });
  const byRule = new Map();
  for (const v of scan.violations || []) { const m = byRule.get(v.rule_id) || { block: 0, warn: 0, request: 0, monitor: 0 }; m[v.mode] = (m[v.mode] || 0) + 1; byRule.set(v.rule_id, m); }
  const block = [...byRule.values()].reduce((n, m) => n + m.block, 0), warn = [...byRule.values()].reduce((n, m) => n + m.warn, 0);
  const evidence = [...byRule].map(([rule, m]) => ({ label: rule, detail: Object.entries(m).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ") }));
  const summary = `${scan.doc_title}, scanned ${day(scan.at)}: ${block} block, ${warn} warn across ${scan.elements_checked} elements (limits: 0 block, ≤ ${MODEL_HEALTH_MAX_WARN} warn).`;
  return block === 0 && warn <= MODEL_HEALTH_MAX_WARN
    ? result(id, label, "met", { summary, evidence })
    : result(id, label, "violations", { count: block + warn, summary, evidence });
}

export function classifyBep(bep, score) {
  const id = "office.bep", label = "A BEP exists and is executable";
  if (!bep) return result(id, label, "violations", { count: 1, summary: "No BEP on this project.", evidence: [{ label: "BEP", detail: "none" }] });
  if (score === null || score === undefined) return result(id, label, "not_checkable", { reason: `“${bep.title}” has no sections yet, so it cannot be scored.` });
  const summary = `“${bep.title}” executability ${score} % (threshold ${BEP_MIN_SCORE} %).`;
  return score >= BEP_MIN_SCORE ? result(id, label, "met", { summary }) : result(id, label, "violations", { count: 1, summary, evidence: [{ label: bep.title, detail: `${score} %` }] });
}

export function classifyRoles(members) {
  const id = "office.roles", label = "Project roles: owner and lead present";
  const have = new Set((members || []).map((m) => m.role));
  const missing = ["owner", "lead"].filter((r) => !have.has(r));
  return missing.length
    ? result(id, label, "violations", { count: missing.length, evidence: missing.map((r) => ({ label: "missing role", detail: r })), summary: `No ${missing.join(" and no ")} on this project.` })
    : result(id, label, "met", { summary: `Owner and lead present (${(members || []).length} members).` });
}

export function classifyTaskTeams(teams) {
  const id = "office.task_teams", label = "Task teams per discipline, each with a lead";
  if (!(teams || []).length) return result(id, label, "violations", { count: 1, summary: "No task teams declared.", evidence: [{ label: "task teams", detail: "none" }] });
  const evidence = teams.filter((t) => !String(t.lead_email || "").trim()).map((t) => ({ label: t.code, detail: `no lead (${t.discipline || "discipline not set"})` }));
  const disciplines = new Set(teams.map((t) => String(t.discipline || "").trim()).filter(Boolean));
  return evidence.length
    ? result(id, label, "violations", { count: evidence.length, evidence, summary: `${evidence.length} of ${teams.length} team(s) have no lead.` })
    : result(id, label, "met", { summary: `${teams.length} team(s) across ${disciplines.size} discipline(s), all with a lead.` });
}

// ── registry entries ─────────────────────────────────────────────────────────────────────────────

const snapshotOr = async (key, fn) => { const s = await getSnapshot(key); return fn(s); };

export const OFFICE_CHECKS = [
  { id: "office.snapshot_present", label: "Office snapshot received", description: "The add-in has sent this office's standards pack and type catalogue within the last 30 days.", params_schema: {},
    async run(key) { return classifySnapshotPresent(await getSnapshot(key)); } },
  { id: "office.naming_rules", label: "Naming rules for families, types, views, sheets", description: "The office ruleset carries naming rules for all four targets and a non-empty office code.", params_schema: {},
    async run(key) { return snapshotOr(key, (s) => s ? classifyNamingRules(s.ruleset) : classifySnapshotPresent(null)); } },
  { id: "office.template_types", label: "Template types follow the type convention", description: "At least 90 % of the template's wall/floor/ceiling/roof/door/window types match the office's TN rules.", params_schema: {},
    async run(key) { return snapshotOr(key, (s) => s ? classifyTemplateTypes(s.catalog, s.ruleset) : classifySnapshotPresent(null)); } },
  { id: "office.worksets", label: "Worksets follow the office whitelist", description: "Every whitelisted workset exists in the template and no others do.", params_schema: {},
    async run(key) { return snapshotOr(key, (s) => s ? classifyWorksets(s.pack?.worksets, s.ruleset) : classifySnapshotPresent(null)); } },
  { id: "office.shared_params", label: "Required shared parameters exist", description: "Every parameter the ruleset requires is bound in the template.", params_schema: {},
    async run(key) { return snapshotOr(key, (s) => s ? classifySharedParams(s.pack?.shared_parameters, s.ruleset) : classifySnapshotPresent(null)); } },
  { id: "office.model_health", label: "Live model health", description: "The latest scan shows no blocking violations and at most 25 warnings.", params_schema: {},
    async run(key) { return classifyModelHealth(await getScan(key)); } },
  { id: "office.bep", label: "A BEP exists and is executable", description: "The project has a BEP whose executability score is at least 50 %.", params_schema: {},
    async run(key) {
      const proj = await ensureProject(key);
      const rows = await sb(`bim_documents?project_id=eq.${enc(proj.id)}&doc_type=eq.BEP&status=neq.archived&order=updated_at.desc&limit=1&select=id,title,doc_type,sections`);
      const bep = Array.isArray(rows) ? rows[0] : rows;
      if (!bep) return classifyBep(null, null);
      const reg = await import("./check-registry.mjs");   // lazy: check-registry imports this file
      return classifyBep(bep, executability(bep, reg.CHECKS.map((c) => c.id), reg.PLANNED_CHECKS.map((p) => p.id)).score);
    } },
  { id: "office.naming_standard", label: "Container naming standard installed", description: "A standards pack is selected for the project (delegates to project.standards_pack).", params_schema: {},
    async run(key) { const reg = await import("./check-registry.mjs"); const r = reg.classifyPack((await getProjectMeta(key)).standards_pack); return { ...r, id: "office.naming_standard" }; } },
  { id: "office.roles", label: "Project roles: owner and lead present", description: "At least one owner and one lead are members of the project.", params_schema: {},
    async run(key) { return classifyRoles(await listMembers(key)); } },
  { id: "office.task_teams", label: "Task teams per discipline, each with a lead", description: "Task teams are declared and each names a lead.", params_schema: {},
    async run(key) { return classifyTaskTeams(await listTeams(key)); } },
];
