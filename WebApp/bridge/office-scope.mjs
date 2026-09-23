// The office as a scope (cohesion phase 2). An office is a projects row of kind "office"; a project
// belongs to at most one office (projects.office_key, migration 0029). Two things live here: which keys
// an assessment reads for a given key, and how per-project check results roll up — worst status wins,
// every evidence line names its project, never a blended figure (honesty rule). Deps-injected so the
// sequencing is unit-tested without Supabase; the default reads cde-store's project rows lazily.

/** Checks that roll up across an office's projects. Template items are deliberately absent: the
 *  template is an office asset, so office.snapshot / naming_rules / template_types / worksets /
 *  shared_params read the office's own snapshot only. */
export const ROLLUP_CHECK_IDS = new Set([
  "office.model_health", "office.bep", "office.roles", "office.task_teams", "office.naming_standard",
  "cde.states", "naming.containers", "ids.last_verdict",
]);

const err = (status, message) => Object.assign(new Error(message), { status });

async function wire(deps = {}) {
  const cde = deps.listProjectRows ? null : await import("./cde-store.mjs");
  return { listProjectRows: deps.listProjectRows || cde.listProjectRows };
}
const kindOf = (row) => (row?.kind === "office" ? "office" : "project");   // rows from before the migration have no kind

export async function officeKeyOf(key, deps) {
  const rows = await (await wire(deps)).listProjectRows();
  const me = rows.find((r) => r.key === key);
  return me && kindOf(me) === "project" ? (me.office_key ?? null) : null;
}

export async function listOfficeProjects(officeKey, deps) {
  const rows = await (await wire(deps)).listProjectRows();
  const office = rows.find((r) => r.key === officeKey);
  if (!office) throw err(404, `Project "${officeKey}" does not exist`);
  if (kindOf(office) !== "office") throw err(409, `"${officeKey}" is a project, not an office`);
  return rows.filter((r) => r.office_key === officeKey).map((r) => ({ key: r.key, name: r.name, id: r.id }));
}

/** The keys an assessment of `key` reads: the office plus its projects, or the project alone. */
export async function projectScope(key, deps) {
  const rows = await (await wire(deps)).listProjectRows();
  const me = rows.find((r) => r.key === key);
  if (!me) throw err(404, `Project "${key}" does not exist`);
  const kind = kindOf(me);
  const keys = kind === "office" ? [key, ...rows.filter((r) => r.office_key === key).map((r) => r.key)] : [key];
  return { key, kind, office_key: kind === "project" ? (me.office_key ?? null) : null, keys };
}

const RANK = { violations: 3, error: 2, not_checkable: 1, met: 0 };

/** Roll per-project results of one check into the office's: worst status wins; `met` needs at least
 *  one project with data and every project with data met; evidence keeps its project; counts add
 *  (they are violation counts, never percentages). */
export function rollupResults(id, label, perProject) {
  if (!perProject.length) return { id, label, status: "not_checkable", count: 0, summary: "", reason: "no projects belong to this office", evidence: [] };
  const withData = perProject.filter((p) => p.result.status === "met" || p.result.status === "violations");
  let status = "not_checkable";
  const worst = perProject.reduce((w, p) => (RANK[p.result.status] ?? 1) > (RANK[w] ?? 1) ? p.result.status : w, "met");
  if (worst === "violations" || worst === "error") status = worst;
  else if (withData.length && withData.every((p) => p.result.status === "met")) status = "met";
  const evidence = [];
  for (const p of perProject) {
    for (const e of p.result.evidence || []) evidence.push({ ...e, label: `[${p.key}] ${e.label}` });
    if (p.result.status === "not_checkable") evidence.push({ label: `[${p.key}]`, detail: p.result.reason || "not checkable" });
    if (p.result.status === "error") evidence.push({ label: `[${p.key}]`, detail: p.result.summary || "error" });
  }
  const summary = perProject.map((p) => `${p.key}: ${p.result.status}${p.result.summary ? " — " + p.result.summary : p.result.reason ? " — " + p.result.reason : ""}`).join(" | ");
  const out = { id, label, status, count: perProject.reduce((n, p) => n + (p.result.count || 0), 0), summary, evidence };
  if (status === "not_checkable") out.reason = withData.length ? "some projects are not checkable" : perProject.map((p) => `${p.key}: ${p.result.reason || "not checkable"}`).join("; ");
  return out;
}
