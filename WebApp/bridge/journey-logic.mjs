// The journey behind the Next strip (docs/superpowers/specs/2026-09-24-next-strip-design.md §1): where an
// office or a project stands, judged from stored facts only. Pure — no I/O; journey-store gathers the facts.
// Honesty rule: a step is `done` only when its predicate holds AND an evidence ref names what proves it; a
// fact source that failed makes only its own steps `not_checkable`, with the error as the reason; `done` and
// `total` are counts, never a percentage.

const web = (tab, hint) => ({ tab, hint });
const GOVERNED_PUBLISH = "Sentinel ▸ Publish ▸ Governed Publish";
const TEAM = { id: "team", label: "Team in place", how: { web: web("Settings", "Members — add an owner and a lead by e-mail (they sign up first)"), revit: null, who: "owner" } };

/** `how` is static text naming where each step is done: a project-space tab of main.ts's tabbed([...]) (or
 *  null when no project tab does it) and a real ribbon path from SentinelAddin/App.cs BuildRibbon. */
export const OFFICE_STEPS = [
  TEAM,
  { id: "standards", label: "Office standards installed", how: { web: web("Settings", "Standards in force — install on this office: Standards sidebar ▸ Install a pack; Documents ▸ EIR ▸ Compile to IDS ▸ Install on this project"), revit: null, who: "lead" } },
  { id: "snapshot", label: "Template snapshot received", how: { web: null, revit: "Sentinel ▸ Standards ▸ Build Office System ▸ Send office snapshot to Sentinel", who: "member" } },
  { id: "readiness", label: "Readiness assessed", how: { web: web("Documents", "+ New document ▸ Create READINESS"), revit: null, who: "lead" } },
  { id: "projects", label: "First project attached", how: { web: web("Settings", "on a project: Settings ▸ Office ▸ pick this office"), revit: null, who: "lead" } },
];

export const PROJECT_STEPS = [
  TEAM,
  { id: "standards", label: "Standards in force", how: { web: web("Settings", "Standards in force — inherited from the office, or install here: Standards sidebar ▸ Install a pack; Documents ▸ EIR ▸ Compile to IDS ▸ Install on this project"), revit: null, who: "lead" } },
  { id: "bep", label: "BEP drafted", how: { web: web("Documents", "+ New document ▸ Create BEP"), revit: null, who: "lead" } },
  { id: "model", label: "Model connected", how: { web: null, revit: "Sentinel ▸ Standards ▸ Project Setup (bind this project), then Synchronize with Central — the scan report is sent after each sync", who: "member" } },
  { id: "verdict", label: "First governed verdict", how: { web: null, revit: GOVERNED_PUBLISH, who: "member" } },
  // A2: Governed Publish only registers versions as `wip`; the Published state is set on the web (Coordination ▸ CDE), so how.revit is null here.
  { id: "published", label: "Accepted and published", how: { web: web("Project Files", "the live version needs an accepted verdict, then set the Published state on the web (Coordination ▸ CDE)"), revit: null, who: "lead" } },
  { id: "federated", label: "Federated", how: { web: web("Project Files", "the live models (one is judged on its own), then Coordination ▸ Clash ▸ Run gate"), revit: null, who: "member" } },
  // A4: no screen does this yet on either surface — surfaces render "no screen for this step yet".
  { id: "issued", label: "Issued", how: { web: null, revit: null, who: "lead" } },
];

const KINDS = ["ids", "ruleset", "naming"];
const ref = (s) => (s === undefined || s === null ? "" : String(s));

// Each rule: the facts it reads, and a decision over their values → { evidence } when the predicate holds,
// { reason } when it does not, { not_checkable } when the step cannot apply yet.
const team = (rows) => {
  const owners = rows.filter((r) => r.role === "owner"), leads = rows.filter((r) => r.role === "lead");
  if (!owners.length || !leads.length) return { reason: `needs an owner and a lead (${owners.length} owner, ${leads.length} lead)` };
  const who = [...owners, ...leads];
  return { evidence: { ref: who.map((r) => ref(r.user_id)).filter(Boolean).join(","), label: who.map((r) => `${r.role} ${r.user_id}`).join(", ") } };
};
const standards = (own) => (s) => {
  const inForce = (k) => !!s[k]?.ref && (own ? s[k].source === "project" : s[k].source === "project" || s[k].source === "office");
  const missing = KINDS.filter((k) => !inForce(k));
  if (missing.length) return { reason: `${own ? "not installed on the office itself" : "nothing in force"}: ${missing.join(", ")}` };
  return { evidence: { ref: KINDS.map((k) => s[k].ref).join(","), label: KINDS.map((k) => s[k].label).join(" | ") } };
};
const docOf = (type, label) => (docs) => {
  const d = docs.find((x) => x.doc_type === type);
  return d ? { evidence: { ref: ref(d.id), label: label(d) } } : { reason: `no ${type} document yet` };
};
const verdict = (rows) => {
  if (!rows.length) return { reason: "no governed verdict recorded yet" };
  const first = rows[rows.length - 1];                                  // rows are newest first
  return { evidence: { ref: first.id == null ? "" : `audit#${first.id}`, label: `verdict ${first.verdict} · audit#${first.id} · version ${first.version_id}` } };
};
const published = (files, rows) => {
  const latest = new Map();
  for (const r of rows) if (!latest.has(r.version_id)) latest.set(r.version_id, r);   // newest first → first seen is latest
  for (const f of files) {
    const v = (f.versions || []).find((x) => x.is_live);
    const judged = v && latest.get(v.id);
    if (v?.state === "published" && judged?.verdict === "accepted")
      return { evidence: { ref: v.id && judged.id != null ? `version ${v.id} · audit#${judged.id}` : "", label: `${f.iso_name} ${v.revision ?? ""} · published · accepted (audit#${judged.id})` } };
  }
  return { reason: "no live version is both published and accepted" };
};
// A5: snapshot/model/federation evidence refs are the stored document's own timestamp — those stores keep one
// latest document with no id, so the timestamp is the only stable ref they can name.
const federated = (fed) => {
  const live = fed.live_set || [];
  // One live model is judged by the gate on its own (option B, 2026-09-28); none is nothing to federate.
  if (!live.length) return { not_checkable: "no live model — nothing to federate" };
  const run = fed.latest;
  if (!run) return { reason: "the Federation Gate has not run" };
  if (run.result?.verdict !== "pass") return { reason: `latest Federation Gate: ${run.result?.verdict ?? "unknown"}` };
  // A pass counts only when it judged every live model (an explicit run over a subset is not the federation).
  if (Array.isArray(run.set)) {
    const seen = new Set(run.set.map((m) => m.container));
    const unjudged = live.filter((l) => l.container && !seen.has(l.container)).length;
    if (unjudged) return { reason: `the latest pass did not judge ${unjudged} live model(s) — run the Federation Gate on the whole live set` };
  }
  // A1: a stale pass no longer counts as done — the live set changed since the gate ran.
  if (fed.stale) return { reason: "latest pass is stale — the live set changed since; re-run the Federation Gate" };
  return { evidence: { ref: run.at ? `federation@${run.at}` : "", label: `federation · pass · ${run.at}` } };
};

const RULES = {
  office: {
    team: [["members"], team],
    standards: [["standards"], standards(true)],
    snapshot: [["snapshot"], (s) => s ? { evidence: { ref: s.at ? `office_snapshot@${s.at}` : "", label: `snapshot · ${s.source?.title ?? "untitled"} · ${s.at}` } } : { reason: "no office snapshot received" }],
    readiness: [["docs"], docOf("READINESS", (d) => `READINESS ${d.title} · ${d.version_count ?? 0} version(s)`)],
    projects: [["children"], (keys) => keys.length ? { evidence: { ref: keys.join(","), label: `projects: ${keys.join(", ")}` } } : { reason: "no project names this office yet" }],
  },
  project: {
    team: [["members"], team],
    standards: [["standards"], standards(false)],
    bep: [["docs"], docOf("BEP", (d) => `BEP ${d.title} · ${d.status}`)],
    // A2 (2026-09-25): model measures the connection, not the judgment — still done from a scan alone — but
    // the label names what judged it, honestly, so "done" is never read as "passed by some ruleset".
    model: [["scan"], (s) => s ? { evidence: { ref: s.at ? `office_scan@${s.at}` : "", label: `scan · ${s.doc_title} · ${s.at} · judged by ${s.ruleset_ref && s.ruleset_ref !== "none" ? s.ruleset_ref : "nothing"}` } } : { reason: "no scan report received for this project" }],
    verdict: [["verdicts"], verdict],
    published: [["files", "verdicts"], published],
    federated: [["federation"], federated],
    issued: [["transmittals"], (tx) => tx.length ? { evidence: { ref: ref(tx[0].id), label: `transmittal ${tx[0].reference ?? tx[0].id} · ${tx[0].issued_at}` } } : { reason: "no transmittal issued yet" }],
  },
};

function judge(def, facts, [needs, decide]) {
  const base = { id: def.id, label: def.label, how: def.how };
  const failed = needs.find((n) => !facts[n]?.ok);
  if (failed) return { ...base, status: "not_checkable", evidence: null, reason: facts[failed]?.error || `${failed}: fact not gathered` };
  const r = decide(...needs.map((n) => facts[n].value));
  if (r.not_checkable) return { ...base, status: "not_checkable", evidence: null, reason: r.not_checkable };
  if (r.evidence && r.evidence.ref) return { ...base, status: "done", evidence: r.evidence, reason: null };
  return { ...base, status: "todo", evidence: null, reason: r.evidence ? "the fact holds but names no evidence id — not counted" : (r.reason ?? null) };
}

/** facts = { project: {key, kind, office_key}, members, standards, snapshot, docs, children, scan, verdicts,
 *  files, federation, transmittals }, every field but project a settled fact {ok:true,value}|{ok:false,error}. */
export function buildJourney(facts) {
  const kind = facts?.project?.kind === "office" ? "office" : "project";
  const steps = (kind === "office" ? OFFICE_STEPS : PROJECT_STEPS).map((def) => judge(def, facts, RULES[kind][def.id]));
  return { kind, steps, next: steps.find((s) => s.status === "todo")?.id ?? null, done: steps.filter((s) => s.status === "done").length, total: steps.length };
}
